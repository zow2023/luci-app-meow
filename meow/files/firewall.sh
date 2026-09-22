#!/bin/sh
# fw4 回调入口: 由 /etc/config/firewall 的 include (type=script) 触发
MEOW_NFT=/etc/meow/gateway.nft

if /etc/init.d/meow running 2>/dev/null; then
	nft -f "$MEOW_NFT" 2>/dev/null || logger -t meow-firewall "nft rules load failed"
else
	nft delete table inet meow_gateway 2>/dev/null
fi
