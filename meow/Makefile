# package/meow/Makefile — modified for source build with full features
include $(TOPDIR)/rules.mk

PKG_NAME:=meow
PKG_VERSION:=0.21.2
PKG_RELEASE:=1
PKG_MAINTAINER:=Max Lv <max.c.lv@gmail.com>
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

# 1. 改为下载 GitHub 官方源码包
PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/meow-rs/meow-rs/tar.gz/v$(PKG_VERSION)?
# 暂时设为 skip，第一次下载后会自动提示校验码，填入准确的 SHA256 即可
PKG_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/meow-rs-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
# 2. 引入 OpenWrt 官方 Rust 编译支持链
include $(TOPDIR)/feeds/packages/lang/rust/rust-package.mk

define Package/meow
  SECTION:=net
  CATEGORY:=Network
  TITLE:=meow - mihomo-compatible tunneling proxy kernel (Rust, Source Build)
  URL:=https://github.com/meow-rs/meow-rs
  DEPENDS:=$(RUST_ARCH_DEPENDS) +ca-certificates
endef

define Package/meow/description
  A high-performance, rule-based tunneling proxy kernel in Rust, compatible
  with mihomo (Clash Meta). Compiled with full features.
endef

define Package/meow/conffiles
/etc/config/meow
/etc/meow/config.yaml
endef

# 3. 核心修改：向 Cargo 传递 --features full 参数
CARGO_PKG_FEATURES:=full

# 删除了原有的空 Build/Compile，由 rust-package.mk 自动接管编译过程

define Package/meow/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/etc/init.d $(1)/etc/config $(1)/etc/meow
	# 4. 从 Rust 编译产物目录获取产出的可执行文件
	$(INSTALL_BIN)  $(PKG_INSTALL_DIR)/bin/meow  $(1)/usr/bin/meow
	$(INSTALL_BIN)  ./files/meow.init            $(1)/etc/init.d/meow
	$(INSTALL_DATA) ./files/meow.config          $(1)/etc/config/meow
	$(INSTALL_DATA) ./files/config.yaml          $(1)/etc/meow/config.yaml
endef

$(eval $(call BuildPackage,meow))
