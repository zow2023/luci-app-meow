# package/meow/Makefile — source build with full features
#
# Licensed under the MIT License.

include $(TOPDIR)/rules.mk

PKG_NAME:=meow
PKG_VERSION:=0.21.2
PKG_RELEASE:=1
PKG_MAINTAINER:=Max Lv <max.c.lv@gmail.com>
PKG_LICENSE:=MIT
PKG_LICENSE_FILES:=LICENSE

PKG_SOURCE:=$(PKG_NAME)-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/meow-rs/meow-rs/tar.gz/v$(PKG_VERSION)?
# TODO: 首次编译成功后，把 make 输出中提示的 SHA256 填进来，替换掉 skip
PKG_HASH:=skip

PKG_BUILD_DIR:=$(BUILD_DIR)/meow-rs-$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
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

# 核心修改点：
#
# 1. meow-rs 是一个 cargo workspace，仓库根目录的 Cargo.toml 是 virtual
#    manifest（只有 [workspace] 段），真正的 CLI crate 在 crates/meow-app。
#    rust-package.mk 的 Build/Compile/Cargo 用 MAKE_PATH 拼接
#    "cargo install --path <MAKE_PATH>"，必须指到包含 [package] 段的
#    子目录，否则报 "found a virtual manifest ... instead of a
#    package manifest"。
MAKE_PATH:=crates/meow-app

# 2. 开启 full 特性。注意变量名必须是 RUST_PKG_FEATURES（不是
#    CARGO_PKG_FEATURES），rust-package.mk 只识别前者。
RUST_PKG_FEATURES:=full

# Build/Compile 由 rust-package.mk 的 Build/Compile/Cargo 自动接管，
# 无需手动定义。

define Package/meow/install
	$(INSTALL_DIR) $(1)/usr/bin $(1)/etc/init.d $(1)/etc/config $(1)/etc/meow
	$(INSTALL_BIN)  $(PKG_INSTALL_DIR)/bin/meow  $(1)/usr/bin/meow
	$(INSTALL_BIN)  ./files/meow.init            $(1)/etc/init.d/meow
	$(INSTALL_DATA) ./files/meow.config          $(1)/etc/config/meow
	$(INSTALL_DATA) ./files/config.yaml          $(1)/etc/meow/config.yaml
endef

$(eval $(call BuildPackage,meow))
