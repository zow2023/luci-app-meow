# luci-app-meow

一个精简的 OpenWrt / LuCI meow 包仓库。

目录结构：

```text
.
├── meow/
│   ├── Makefile
│   ├── prebuilt-meow
│   └── files/
├── luci-app-meow/
│   ├── Makefile
│   ├── htdocs/
│   └── root/
├── .github/
│   └── workflows/
│       └── build-core.yml
├── README.md
└── UPSTREAM.json
```

## Upstream

核心来源固定在 `UPSTREAM.json`：

- Repository: `https://github.com/meow-rs/meow-rs.git`
- Path: `openwrt/`
- Commit: `8e464a26ae94e73771201f81d707876bc72aae3`

`meow/files/` 与 LuCI `root/` 保持上游目录布局；LuCI 静态目录按独立包形式固化。

## Manual upstream sync

.github/workflows/sync-upstream.yml 支持 GitHub Actions 的手动同步。

使用方式：

1. 打开仓库的 **Actions → Sync upstream openwrt tree**。
2. 点击 **Run workflow**。
3. `ref` 默认填写 `main`，表示同步上游最新提交；也可以填写 branch、tag 或 commit SHA。
4. workflow 会更新 `UPSTREAM.json`，同步上游 `openwrt/meow/files/`、`openwrt/luci-app-meow/htdocs/` 和 `openwrt/luci-app-meow/root/`。
5. 同步提交推送到本仓库 `main` 后，`build-core.yml` 会自动重新构建对应版本的 `meow/prebuilt-meow`。

同步不会覆盖本仓库自己的 `meow/Makefile`、`meow/prebuilt-meow` 和 `luci-app-meow/Makefile`。

## Core build

`.github/workflows/build-core.yml` 只做一件事：

1. 读取 `UPSTREAM.json` 中的精确 commit；
2. checkout 对应 meow-rs 源码；
3. 使用上游 `rust-toolchain.toml`；
4. 构建 `aarch64-unknown-linux-musl`；
5. 写入 `meow/prebuilt-meow`；
6. 自动提交回 `main`。

这样 OpenWrt feed 本身不再参与 Rust 编译，也不再下载或拼装整个 upstream `openwrt/` 子树。

## Bootstrap

由于这个附件环境不能直接把 GitHub Release 的 3 MB 二进制资产原样转进附件，`meow/prebuilt-meow` 在上传包中是占位文件。新仓库上传后，`build-core.yml` 会自动生成真实的静态 aarch64/musl `prebuilt-meow` 并提交回仓库。

在二进制生成前，OpenWrt `meow` package 会主动报错，避免把占位文件误装成 `/usr/bin/meow`。

## Note about bundled YAML helper

上游 `htdocs` 中的 `meow_yaml.js` 是由 npm 生成的约百 KB 的压缩 bundle。为了保持这个可上传附件的体积可控，本包保留了同一路径的兼容模块；当前 Configuration 页面直接校验并写入 YAML，不依赖该 AST bundle。
