'use strict';
'require view';
'require form';
'require rpc';
'require poll';
'require uci';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('meow'), {}).then(function(res) {
		try {
			return res['meow']['instances']['meow']['running'] === true;
		} catch (e) {
			return false;
		}
	});
}

function renderStatus(running) {
	return running
		? E('span', { 'style': 'color: #2e7d32; font-weight: bold;' },
			_('RUNNING'))
		: E('span', { 'style': 'color: #c62828; font-weight: bold;' },
			_('NOT RUNNING'));
}

return view.extend({
	load: function() {
		return uci.load('meow');
	},

	render: function() {
		var m, s, o;

		m = new form.Map('meow', _('meow'),
			_('Rule-based tunneling proxy kernel, compatible with mihomo (Clash Meta). ' +
			  'Proxies, rules and DNS are configured in the YAML file below; ' +
			  'use the Panel tab for runtime control.'));

		s = m.section(form.NamedSection, 'main', 'meow');

		o = s.option(form.DummyValue, '_status', _('Status'));
		o.rawhtml = true;
		o.cfgvalue = function() {
			var node = E('span', {}, _('Collecting data…'));
			poll.add(function() {
				return getServiceStatus().then(function(running) {
					while (node.firstChild)
						node.removeChild(node.firstChild);
					node.appendChild(renderStatus(running));
				});
			});
			return node;
		};

		o = s.option(form.Flag, 'enabled', _('Enable'),
			_('Start the service at boot. Saving & applying restarts the service.'));
		o.rmempty = false;

		o = s.option(form.Value, 'config_file', _('Configuration file'),
			_('Path to the meow YAML configuration.'));
		o.default = '/etc/meow/config.yaml';
		o.rmempty = false;

		o = s.option(form.Value, 'work_dir', _('Working directory'),
			_('Directory for GeoIP databases, caches and downloaded rulesets.'));
		o.default = '/etc/meow';
		o.rmempty = false;

		o = s.option(form.Value, 'panel_port', _('Panel port'),
			_('Port of the REST API / built-in web panel. Must match the ' +
			  '<code>external-controller</code> port in the YAML configuration.'));
		o.datatype = 'port';
		o.default = '9090';
		o.rmempty = false;

		/* -------------------------------------------------------------- *
		 * Transparent gateway (forwarded LAN traffic -> tproxy listener)  *
		 * -------------------------------------------------------------- */

		o = s.option(form.Flag, 'gateway', _('Transparent gateway'),
			_('Intercept traffic <em>forwarded</em> from LAN clients (transparent ' +
			  'proxy gateway) via an nftables prerouting REDIRECT to the tproxy ' +
			  'listener. Requires a <code>listeners:</code> entry with a ' +
			  'non-loopback <code>listen</code> (e.g. <code>\'::\'</code>) and a ' +
			  '<code>dns.listen</code> matching the DNS port below in the YAML ' +
			  'configuration. Rules are loaded after the listener is up and ' +
			  're-applied on every firewall reload; they are removed when the ' +
			  'service stops or this option is disabled.'));
		o.default = o.disabled = false;
		o.enabled  = '1';
		o.disabled = '0';
		o.rmempty = false;
		o.depends('enabled', '1');

		o = s.option(form.Value, 'tproxy_port', _('tproxy port'),
			_('Port of the tproxy listener the gateway redirects to. Must match ' +
			  'the <code>port</code> of the tproxy entry in <code>listeners:</code> ' +
			  'in the YAML configuration.'));
		o.datatype = 'port';
		o.default = '7893';
		o.placeholder = '7893';
		o.rmempty = false;
		o.depends('gateway', '1');

		o = s.option(form.Value, 'dns_port', _('DNS hijack port'),
			_('LAN DNS queries are DNAT\'d to the gateway\'s meow DNS resolver on ' +
			  'this port. Must match the <code>dns.listen</code> port in the YAML ' +
			  'configuration.'));
		o.datatype = 'port';
		o.default = '1053';
		o.placeholder = '1053';
		o.rmempty = false;
		o.depends('gateway', '1');

		return m.render();
	}
});
