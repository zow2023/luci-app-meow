// SPDX-License-Identifier: Apache-2.0

'use strict';
'require dom';
'require poll';
'require rpc';
'require ui';
'require view';

/*
 * meow (meow-rs) does NOT write a log file on OpenWrt:
 * its procd init script enables `stdout 1` / `stderr 1`, so all service
 * output goes into the system log (syslog/logd ring buffer, in /tmp).
 * This view therefore reads the syslog via the ubus `log` object and
 * filters lines belonging to the meow service in the frontend.
 *
 * On this firmware the ubus `log read` entries use field `msg` (not
 * `data` as previously assumed); `data` is kept as a fallback.
 *
 * "Clear Log" (view-level, PLAN A):
 * ubus `log` has no clear method (only read/write), and restarting logd
 * would erase the WHOLE system log — out of scope for a proxy app.
 * Instead we remember the highest entry `id` seen at clear time and hide
 * everything at or below it in subsequent polls. The underlying syslog
 * data is untouched.
 */

var callSystemLog = rpc.declare({
	object: 'log',
	method: 'read',
	params: [ 'lines', 'stream' ],
	expect: {}
});

var serviceTag = 'meow';

/* Read a larger window: the syslog ring buffer is shared by all services
 * (firewall, dropbear, dhcp, ...), so a small `lines` value can easily
 * contain just a handful of meow entries — or none at all. */
var LOG_READ_LINES = 1000;

return view.extend({
	render: function () {
		/* Thanks to luci-app-aria2 */
		var css = '					\
			#log_textarea {				\
				text-align: left;			\
				max-height: 70vh;		\
				overflow-y: auto;			\
				color-scheme: light dark;	\
				background-color: #f8f9fa;	\
				border-radius: 8px;		\
				border: 1px solid #ddd;		\
				font-size: 13px;		\
				box-shadow: 0 2px 5px rgba(0,0,0,0.05); \
			}					\
			#log_textarea pre {			\
				padding: .7rem;			\
				word-break: break-all;	\
				margin: 0;				\
				font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;	\
				line-height: 1.4;		\
			}					\
			.log-info { color: #0366d6; }		\
			.log-warn { color: #f59f00; }		\
			.log-error { color: #d73a49; font-weight: bold; } \
			.log-debug { color: #6f42c1; }		\
			.log-ip { color: #22863a; font-weight: bold; }		\
			.log-container {            \
				padding: 2px 0;        \
			}                          \
			.log-container:hover {     \
				background-color: rgba(0,0,0,0.03); \
			}                          \
			.controls-container {      \
				margin-bottom: 15px;   \
				display: flex;         \
				flex-wrap: wrap;       \
				gap: 10px;             \
			}                          \
			.controls-row {            \
				display: flex;         \
				gap: 10px;             \
				flex-wrap: wrap;       \
				margin-bottom: 10px;   \
			}                          \
			.controls-row:last-child { \
				margin-bottom: 0;      \
			}                          \
			#filterInput {             \
				max-width: 200px;      \
				flex: 1;               \
				min-width: 120px;      \
				padding: 5px;          \
				border-radius: 4px;    \
				border: 1px solid #ddd; \
			}                          \
			.filter-highlight {        \
				background-color: #ffeb3b; \
				color: black;          \
				padding: 0 2px;        \
				border-radius: 3px;    \
				font-weight: bold;     \
			}                          \
			#log_textarea::-webkit-scrollbar {	\
				width: 10px;			\
			}					\
			#log_textarea::-webkit-scrollbar-track {\
				background: rgba(0, 0, 0, 0.03);	\
				border-radius: 4px;      \
			}					\
			#log_textarea::-webkit-scrollbar-thumb {\
				background: rgba(0, 0, 0, 0.15);	\
				border-radius: 4px;		\
				border: 2px solid #f8f9fa; \
			}					\
			#log_textarea::-webkit-scrollbar-thumb:hover {\
				background: rgba(0, 0, 0, 0.25);	\
			}					\
			@media (prefers-color-scheme: dark) {	\
				#log_textarea {			\
					background-color: #252a30;	\
					border-color: #444;		\
					color: #e6e6e6;       \
				}				\
				.log-container:hover {     \
					background-color: rgba(255,255,255,0.05); \
				}                          \
				.filter-highlight {        \
					background-color: #b58b00; \
					color: #ffffff;       \
				}                          \
				.log-info { color: #58a6ff; }  \
				.log-warn { color: #ffab70; }  \
				.log-error { color: #f97583; } \
				.log-debug { color: #d2a8ff; } \
				.log-ip { color: #7ee787; }    \
				#log_textarea::-webkit-scrollbar-track {\
					background: rgba(255, 255, 255, 0.03);\
				}				\
				#log_textarea::-webkit-scrollbar-thumb {\
					background: rgba(255, 255, 255, 0.15);\
					border: 2px solid #252a30; \
				}				\
				#log_textarea::-webkit-scrollbar-thumb:hover {\
					background: rgba(255, 255, 255, 0.25);\
				}							\
				#filterInput {          \
					background-color: #252a30; \
					border-color: #444; \
					color: #e6e6e6;     \
				}                       \
			}                          \
			@media (min-width: 768px) { \
				.controls-container {  \
					flex-direction: row; \
					flex-wrap: nowrap;  \
				}                      \
				.controls-row {        \
					margin-bottom: 0;   \
					flex: 1;           \
				}                      \
				.controls-row:first-child { \
					flex: 2;           \
				}                      \
			}';

		var log_textarea = E('div', { 'id': 'log_textarea' },
			E('img', {
				'src': L.resource('icons/loading.gif'),
				'alt': _('Loading...'),
				'style': 'vertical-align:middle'
			}, _('Collecting data…'))
		);

		function escapeHtml(s) {
			return s.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
		}

		function formatLogLine(line) {
			line = escapeHtml(line);

			/* NOTE: level keywords are highlighted before IPs so that
			 * "info" inside a wrapped IP context can't interfere; the old
			 * dead `level=` rule was removed — it could never match,
			 * since the keyword had already been wrapped by the rule
			 * above by the time it ran. */
			line = line
				.replace(/\b(error|failed)\b/g, '<span class="log-error">$1</span>')
				.replace(/\b(warn|warning)\b/g, '<span class="log-warn">$1</span>')
				.replace(/\b(info|INFO)\b/g, '<span class="log-info">$1</span>')
				.replace(/\b(debug|DEBUG)\b/g, '<span class="log-debug">$1</span>');

			line = line.replace(/(\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b)/g,
				'<span class="log-ip">$1</span>');

			return '<div class="log-container">' + line + '</div>';
		}

		var originalLogContent = '';
		var logEntriesCache = null;
		var debounceTimeout = null;
		var isPaused = false;

		/* ---- Clear Log (view-level) state ----
		 * clearBeforeId: highest syslog entry id present when the user
		 * hit "Clear". Polling hides entries with id <= clearBeforeId.
		 * -1 = never cleared. maxSeenId tracks the newest id we saw. */
		var clearBeforeId = -1;
		var maxSeenId = -1;

		function debounce(func, wait) {
			return function (...args) {
				const context = this;
				clearTimeout(debounceTimeout);
				debounceTimeout = setTimeout(() => {
					func.apply(context, args);
				}, wait);
			};
		}

		/* Escape a filter string for safe interpolation into HTML built
		 * from ALREADY-escaped text (used by the filter highlighter). */
		function escapeFilterForHtml(s) {
			return escapeHtml(s);
		}

		var tagRegex = new RegExp('\\b' + serviceTag + '\\b');

		poll.add(L.bind(function () {
			if (isPaused) {
				return Promise.resolve();
			}

			return callSystemLog(LOG_READ_LINES, false)
				.then(function (res) {
					/* ubus `log read` returns different top-level shapes
					 * across firmware versions:
					 *   logd:         { "log":   [ { msg, id, ... }, ... ] }
					 *   legacy iface: { "lines": [ { msg, id, ... }, ... ] }
					 *   rare:         the array itself.
					 * Entries carry a monotonically increasing `id` field,
					 * which the Clear Log feature relies on. */
					var entries;
					if (Array.isArray(res))
						entries = res;
					else if (res && Array.isArray(res.log))
						entries = res.log;
					else if (res && Array.isArray(res.lines))
						entries = res.lines;
					else
						entries = [];

					var meowLines = [];

					for (var i = 0; i < entries.length; i++) {
						var e = entries[i];
						if (!e) continue;

						/* Track the newest id we have ever seen; the
						 * Clear button uses it as its cut-off point. */
						if (typeof e.id === 'number' && e.id > maxSeenId)
							maxSeenId = e.id;

						/* Hide everything at/below the clear point. */
						if (clearBeforeId >= 0 &&
						    typeof e.id === 'number' && e.id <= clearBeforeId)
							continue;

						var data = e.msg || e.data || '';
						if (data && tagRegex.test(data))
							meowLines.push(data);
					}

					/* Keep syslog's natural order: OLDEST FIRST, so the
					 * "Scroll to tail" button (bottom = newest) matches
					 * the reading habit of log viewers. The previous
					 * version reversed the list here, which made the
					 * tail button scroll to the OLDEST entry. */
					// (no reverse)

					var formattedLines = meowLines.map(function (line) {
						return formatLogLine(line);
					});

					var formattedContent = formattedLines.join('');
					originalLogContent = formattedContent;
					logEntriesCache = null;

					var logContainer = E('pre', {});
					logContainer.innerHTML = formattedContent ||
						(clearBeforeId >= 0
							? _('Log cleared. New meow entries will appear below.')
							: _('Log is empty (no meow entries in the system log yet).'));

					dom.content(log_textarea, logContainer);

					var filterInput = document.getElementById('filterInput');
					if (filterInput && filterInput.value) {
						applyFilter(filterInput.value);
					}
				}).catch(function (e) {
					var log;

					if (e.toString().includes('AccessDenied'))
						log = E('pre', { 'wrap': 'pre' }, [
							_('Access denied: add "log": ["read"] to the ACL of luci-app-meow, then log in again.')
						]);
					else
						log = E('pre', { 'wrap': 'pre' }, [
							_('Unknown error: %s').format(e)
						]);

					dom.content(log_textarea, log);
				});
		}));

		function cacheLogEntries() {
			if (logEntriesCache) return logEntriesCache;

			var logContainer = document.getElementById('log_textarea');
			var entries = logContainer.querySelectorAll('.log-container');
			logEntriesCache = [];

			entries.forEach(function (entry) {
				logEntriesCache.push({
					element: entry,
					text: entry.textContent.toLowerCase(),
					originalHtml: entry.innerHTML
				});
			});

			return logEntriesCache;
		}

		function applyFilter(filter) {
			if (!filter) {
				var logContainer = document.getElementById('log_textarea');
				var preElem = logContainer.querySelector('pre');
				if (preElem) {
					preElem.innerHTML = originalLogContent ||
						_('Log is empty.');
					logEntriesCache = null;
				}
				return;
			}

			filter = filter.toLowerCase();
			var entries = cacheLogEntries();
			var matchCount = 0;

			requestAnimationFrame(function () {
				entries.forEach(function (entry) {
					if (entry.text.includes(filter)) {
						matchCount++;

						/* FIX (was a real bug): the old code ran a
						 * regex over `originalHtml`, i.e. over markup
						 * that already contains <span class="log-...">
						 * tags. A filter like "span", "class" or "log"
						 * matched INSIDE those tags and corrupted the
						 * HTML; unescaped filter text could also inject
						 * arbitrary markup.
						 *
						 * New approach: rebuild the line from its plain
						 * textContent (which is already entity-escaped
						 * source text), escape it again for HTML, and
						 * only highlight the filter hits. The tradeoff
						 * is that level-color highlighting is suspended
						 * while a filter is active — a correct and
						 * predictable rendering is worth it. */
						var plain = entry.element.textContent;
						var safeText = escapeHtml(plain);
						var safeFilter = escapeFilterForHtml(filter)
							.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
						var re = new RegExp('(' + safeFilter + ')', 'gi');

						entry.element.innerHTML =
							safeText.replace(re,
								'<span class="filter-highlight">$1</span>');
						entry.element.style.display = '';
					} else {
						entry.element.style.display = 'none';
					}
				});
			});
		}

		var scrollDownButton = E('button', {
			'id': 'scrollDownButton',
			'class': 'cbi-button cbi-button-neutral',
		}, _('Scroll to tail', 'scroll to bottom (the tail) of the log file')
		);
		scrollDownButton.addEventListener('click', function () {
			var logContainer = document.getElementById('log_textarea');
			if (logContainer) {
				logContainer.scrollTop = logContainer.scrollHeight;
			}
		});

		var scrollUpButton = E('button', {
			'id': 'scrollUpButton',
			'class': 'cbi-button cbi-button-neutral',
		}, _('Scroll to head', 'scroll to top (the head) of the log file')
		);
		scrollUpButton.addEventListener('click', function () {
			var logContainer = document.getElementById('log_textarea');
			if (logContainer) {
				logContainer.scrollTop = 0;
			}
		});

		var clearFilterButton = E('button', {
			'id': 'clearFilterButton',
			'class': 'cbi-button cbi-button-neutral',
		}, _('Clear Filter')
		);

		var refreshToggleButton = E('button', {
			'id': 'refreshToggleButton',
			'class': 'cbi-button cbi-button-neutral',
		}, '⏸ ' + _('Pause Refresh'));

		refreshToggleButton.addEventListener('click', function () {
			isPaused = !isPaused;
			if (isPaused) {
				refreshToggleButton.innerHTML = '▶ ' + _('Resume Refresh');
				refreshToggleButton.className = 'cbi-button cbi-button-positive';
			} else {
				refreshToggleButton.innerHTML = '⏸ ' + _('Pause Refresh');
				refreshToggleButton.className = 'cbi-button cbi-button-neutral';
			}
		});

		var filterInput = E('input', {
			'id': 'filterInput',
			'type': 'text',
			'placeholder': _('Filter logs...'),
			'style': 'padding: 5px; border-radius: 4px; border: 1px solid #ddd; width: 200px;'
		});

		filterInput.addEventListener('input', debounce(function () {
			var filter = this.value;
			applyFilter(filter);
		}, 200));

		clearFilterButton.addEventListener('click', function () {
			var filterInput = document.getElementById('filterInput');
			if (filterInput) {
				filterInput.value = '';
				applyFilter('');
				logEntriesCache = null;
			}
		});

		/* ---- Clear Log button (view-level only) ----
		 * Hides everything currently displayed from this point on.
		 * The system log itself is NOT modified — ubus `log` has no
		 * clear method, and restarting logd would wipe the whole
		 * system log for ALL services, which is out of scope here. */
		var clearLogButton = E('button', {
			'id': 'clearLogButton',
			'class': 'cbi-button cbi-button-negative',
			'title': _('Hides all currently displayed meow entries in this view. The system log itself is not modified.')
		}, _('Clear Log'));

		clearLogButton.addEventListener('click', function () {
			ui.showModal(_('Clear Log'), E('p', {},
				_('Hide all currently displayed meow log entries? ' +
				  'This only affects this view — new entries arriving ' +
				  'afterwards will be shown as usual. The system log ' +
				  'itself (shared by all services) is not modified.')),
				[
					E('div', { 'class': 'right' }, [
						E('button', {
							'class': 'btn',
							'click': ui.hideModal
						}, _('Cancel')),
						' ',
						E('button', {
							'class': 'btn cbi-button-negative important',
							'click': ui.createHandlerFn(function () {
								/* Cut off everything up to the newest id
								 * we have seen. Subsequent polls skip
								 * entries with id <= clearBeforeId, so
								 * old lines cannot "come back". */
								clearBeforeId = maxSeenId;
								logEntriesCache = null;
								dom.content(log_textarea,
									E('pre', {},
										_('Log cleared. New meow entries will appear below.')));
								ui.hideModal();
							})
						}, _('Clear'))
					])
				]);
		});

		return E([
			E('style', [css]),
			E('h2', {}, [_('Log')]),
			E('div', { 'class': 'cbi-map' }, [
				E('div', { 'class': 'controls-container' }, [
					E('div', { 'class': 'controls-row' }, [
						filterInput,
						clearFilterButton,
						refreshToggleButton
					]),
					E('div', { 'class': 'controls-row' }, [
						scrollUpButton,
						scrollDownButton,
						clearLogButton
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					log_textarea,
					E('div', { 'style': 'text-align:right; margin-top: 5px;' },
						E('small', {}, _('Refresh every %s seconds.').format(L.env.pollinterval))
					)
				])
			])
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
