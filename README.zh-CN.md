# CatGo：Codex 右侧结构编辑器

在 Codex 桌面端的右侧面板查看和编辑分子、晶体，并按 Miller 指数切出 slab。
安装包包含 3D 编辑器和 WASM，不需要启动 CatGo 服务，也不需要访问私有仓库。

## 安装

需要支持 MCP Apps 与文件入口的 Codex 桌面端、支持插件源命令的新版 Codex CLI，
以及能通过 `python3` 命令启动的 Python 3.10 或以上版本。
Linux 已在开发环境验证；macOS、Windows 的原生界面尚未验证。

```sh
codex plugin marketplace add Hello-QM/catgo-codex-plugin
codex plugin add catgo-editor@catgo
```

安装后刷新插件连接或新开聊天，再在右侧打开 `.cif`、`.xyz`、`.extxyz`、
`.poscar`、`.vasp` 文件。无扩展名的 `POSCAR`、`CONTCAR` 可以通过编辑器的
**Open** 导入。测试结构见 [examples/](examples/)。

如果此前安装报 `missing plugin.json`，先运行
`codex plugin marketplace upgrade catgo` 刷新市场，再重新安装。
0.2.9 已补齐旧版 Codex 所需的兼容清单和 MCP 配置。

Windows 用户应先检查 `python3 --version` 能否从启动 Codex 的环境运行。
当前配置调用 `python3`，只有 `python` 或 `py` 命令还不够。
如不能安装或画面为空，见 [故障排查](docs/troubleshooting.md)。

## 功能

0.2.12 修复隐藏标签的初始化误报，以及自身保存通知导致的文档重载和撤销历史丢失。
无需通过反复重开标签恢复编辑，见[修复与验证范围](docs/lifecycle-fix-0.2.12.md)。

- 原子、化学键、晶胞的 3D 显示、选择与坐标编辑，支持撤销和重做。
- 在 **Controls → Bonds** 中调整 **Cell-edge stub bonds** 和 **Stub Length**。
  0.2.11 已在 Linux 的 Codex 右侧原生编辑器中验证 1.0/0.5 及开关的画布变化，
  见[现场截图与复现步骤](docs/native-host-0.2.11.md)。
- 从 Codex 打开的可写文件可用 **Save** 保存；保存检查文件版本，冲突时保留编辑。
  0.2.11 已用全新的 157 原子测试副本完成 Linux 原生坐标编辑、保存前撤销/重做、
  实际落盘及重新打开读取核验，原件哈希和修改时间未变，详见[验收记录](docs/native-host-0.2.11.md)。
- **Open** 和拖入的结构作为副本编辑，通过 **Export** 导出。
- **Build Tools → Slab** 支持 Miller 指数、厚度/层数、终止面、面内超胞、
  conventional cell 和真空层。结果是几何切割结构，不包含弛豫或能量计算。
- 点击 **Send selection** 才把选中的原子信息发送到模型上下文。

## 论文与引用方式

如果你使用本插件进行科研，例如分子/晶体结构编辑或 slab 构建，请在相关论文
或科研成果中引用我们的 CatGo 论文：

Liu, G.; Ma, X.; Zhang, L.; Pascasio, J.; Yang, J.; Chen, Y.; Li, W.-L.
**CatGo: Bridging CLI coding agents with interactive structure and workflow management for computational chemistry.**
*Digital Discovery* **2026**, *5*(9), 3825–3849.
DOI: [10.1039/D6DD00273K](https://doi.org/10.1039/D6DD00273K).

可直接复制以下 BibTeX，也可下载 [CITATION.bib](CITATION.bib)，或点击 GitHub
仓库的 **Cite this repository** 引用入口。[CITATION.cff](CITATION.cff) 已将这篇
论文设置为首选引用。

```bibtex
@article{Liu2026CatGo,
  author  = {Liu, Guangsheng and Ma, Xiao and Zhang, Leshen and
             Pascasio, Jenedith and Yang, Jonathan and Chen, Yuxiang and
             Li, Wan-Lu},
  title   = {{CatGo}: Bridging {CLI} coding agents with interactive structure and workflow management for computational chemistry},
  journal = {Digital Discovery},
  year    = {2026},
  volume  = {5},
  number  = {9},
  pages   = {3825--3849},
  doi     = {10.1039/D6DD00273K},
  url     = {https://doi.org/10.1039/D6DD00273K}
}
```

## 更新

```sh
codex plugin marketplace upgrade catgo
codex plugin add catgo-editor@catgo
```

更新后刷新插件连接再打开文件。卸载命令：

```sh
codex plugin remove catgo-editor@catgo
codex plugin marketplace remove catgo
```

本仓库是独立的 GitHub 插件源，尚未进入 OpenAI 官方公开市场。
安装无需 CatGo 账号或 API key。插件的构建步骤、验证范围、许可证见
[英文 README](README.md) 和 [docs/](docs/)。
