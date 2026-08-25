# Desktop App Ubuntu 维护与打包

> 文档类型：Ubuntu 维护与本地安装 authority
>
> 状态：Ubuntu 24.04 x64 完整离线 `.deb`、本地安装启动和 Workspace production gate 已实现；公开发行许可 Gate 仍未满足
>
> 产品边界见 [Desktop App 与外部 Agent 产品架构](DESKTOP_APP_PRODUCT.md)，macOS 双架构发行见
> [Desktop App macOS 维护与发行](DESKTOP_APP_MACOS_MAINTENANCE.md)，当前实现事实见
> [ITERATION_STATUS.md](ITERATION_STATUS.md)。

## 1. 平台边界

Ubuntu 是 macOS 之外的独立原生目标，不替换或合并 macOS 打包逻辑：

| 目标 | 架构 | 安装包 | Runtime Pack native closure |
| --- | --- | --- | --- |
| macOS | `arm64` | unsigned DMG | Darwin arm64 |
| macOS | `x64` | unsigned DMG | Darwin x64 |
| Ubuntu 24.04+ | `x64` / `amd64` | Debian package | Linux x64 glibc |

每个安装包只携带与目标平台和架构匹配的 Electron、Node、Remotion compositor、Chromium、FFmpeg/FFprobe 与
动态库闭包。禁止在 Linux 包中携带 Darwin compositor，反之亦然；不发布把三套 native closure 合并到一起的通用包。
最终用户不需要预装 Node/npm/Git。

当前 Ubuntu 支持范围固定为 x64 glibc；ARM64、其他发行版与 Windows 尚未声明支持。私有配置使用 Electron
`safeStorage` 对接当前系统的安全存储；无可用安全存储时保存必须 fail closed，不能回退到明文。

## 2. 构建命令

仓库把 release toolchain 固定为 Node `22.23.1`，避免开发机的全局 Node 版本改变 Electron/SEA 打包结果。

```bash
# macOS：保留原有双原生流程；分别在对应 native runner 上执行
npm run desktop:package:mac -- --architecture arm64
npm run desktop:package:mac -- --architecture x64

# Ubuntu 24.04 x64：在本机生成完整离线 .deb
npm run desktop:package:ubuntu
```

Ubuntu 输出位于 `out/make/deb/x64/axmorf-studio_<version>_amd64.deb`。脚本按顺序完成品牌资源、Linux Runtime
Pack、Forge package、locale 收缩、严格 package inventory 与 Debian maker；任一步失败都不交付安装包。
macOS DMG 的 native gate、挂载安装验证、checksum/release manifest 与双架构 set 仍由既有
`desktop:dmg` / `desktop:release:*` 流程管理。

## 3. 本地安装与验证

```bash
sudo apt-get install ./out/make/deb/x64/axmorf-studio_<version>_amd64.deb
axmorf-studio
```

提交前至少运行：

```bash
npm run desktop:check
npm run desktop:ubuntu-workspace-gate
```

安装验收需确认：package architecture 为 `amd64`；入口 `/usr/bin/axmorf-studio` 可启动；Chromium sandbox 权限
正确；内置 Workspace 能创建 Project、使用两个 boundary Scene templates、完成生产并生成 exact-four-file
Delivery；Preview、生产进度和 Project 删除操作可用；退出后没有遗留 Engine、Runtime Pack、TCP listener 或 lock。

`.deb` 当前是本地/internal unsigned artifact，不等于公开发行。Remotion runtime binary redistribution、第三方许可证、
provenance/SBOM、下载渠道和长期支持政策仍必须满足与 macOS 相同的公开发行 Gate。
