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

## Claude Code

同一个包也能作为 Claude Code 插件安装。在 Claude Code 里运行：

```text
/plugin marketplace add Hello-QM/catgo-codex-plugin
/plugin install catgo-editor@catgo
```

也可在终端运行 `claude plugin marketplace add Hello-QM/catgo-codex-plugin`
和 `claude plugin install catgo-editor@catgo`，然后重开会话。

直接让 Claude 看结构（例如“看一下 /path/to/CONTCAR”）。插件的 `view_structure`
工具会启动一个本机页面，运行同一个预编译编辑器，Claude 把它打开在 Claude
桌面端右侧的 Browser 栏里；之后的文件会直接载入已打开的页面。纯终端会话里，
把 Claude 给出的链接复制到任意浏览器即可。无扩展名的 `POSCAR`/`CONTCAR*` 可直接打开。

- **Save**：带版本检查写回原文件；磁盘上的文件被改动会自动重载，有未保存编辑时提示冲突。
- **Export** 和所有下载都会弹出系统的“另存为”对话框，由你选择保存位置；浏览器不支持时，页面会让你输入路径（默认是原文件所在目录），覆盖已有文件前会先确认。
- 工具栏的 **Import / Export**（↑↓）→ **More formats…** 打开 CatGo 自己的导出面板：各种结构格式、图片，以及 QE/VASP/LAMMPS/CP2K/Gaussian/GROMACS/ORCA/ABACUS/AMBER/SPARK 输入文件，保存方式同上。
- **Send selection**：选中原子后点它，再问 Claude，`get_viewer_selection` 会返回这些原子的序号、元素和笛卡尔坐标。
- 页面顶栏也可以直接输入绝对路径打开文件。

页面服务监听 `127.0.0.1:47821`（用 `CATGO_VIEWER_PORT` 修改），30 分钟没有页面连接后自动退出。
API 需要随机 token（保存在 `~/.cache/catgo-viewer/`，仅本用户可读），且只读写
CIF、XYZ、extXYZ、POSCAR/CONTCAR 和 `.vasp` 文件。

## 功能

0.2.15 新增 Claude Code 支持，并在 Import / Export → **More formats…** 中加入 CatGo
自己的导出面板；0.2.15 尚未在 Codex 原生环境中验收。
0.2.14 修复宿主下载协议兼容和 Import / Export 工具栏入口；没有 WebGPU 时，
性能按钮可切换并恢复 WebGL 绘制分辨率。见[修复与验证范围](docs/file-actions-0.2.14.md)。
0.2.14 尚未在当前原生标签中激活和验收；下列原生结果仅适用于各自标明的旧版本。

0.2.12 修复隐藏标签的初始化误报，以及自身保存通知导致的文档重载和撤销历史丢失。
无需通过反复重开标签恢复编辑，见[修复与验证范围](docs/lifecycle-fix-0.2.12.md)。
2026-10-29 已确认右侧实际载入 0.2.12，并用 157 原子测试副本完成三轮原生保存、
保存后撤销/重做及跨保存历史回退与恢复；未重开文件，原件未变。
详见[原生验收记录与范围](docs/native-host-0.2.12.md)，私有结构和截图保留在本地。

- 原子、化学键、晶胞的 3D 显示、选择与坐标编辑，支持撤销和重做。
- 在 **Controls → Bonds** 中调整 **Cell-edge stub bonds** 和 **Stub Length**。
  0.2.11 已在 Linux 的 Codex 右侧原生编辑器中验证 1.0/0.5 及开关的画布变化，
  见[现场截图与复现步骤](docs/native-host-0.2.11.md)。
- 从 Codex 打开的可写文件可用 **Save** 保存；保存检查文件版本，冲突时保留编辑。
  0.2.11 已用全新的 157 原子测试副本完成 Linux 原生坐标编辑、保存前撤销/重做、
  实际落盘及重新打开读取核验，原件哈希和修改时间未变，详见[验收记录](docs/native-host-0.2.11.md)。
- **Open** 和拖入的结构作为副本编辑，通过 **Export** 导出。
- **Import / Export** 提供 POSCAR、Extended XYZ 和 CIF 导出；其中的 **More formats…**
  打开 CatGo 的导出面板，可导出其他格式、计算输入文件和图片。
  固定/自由标记请用 POSCAR 或 Extended XYZ 保留；CIF 仅保留结构几何和晶胞。
  无 WebGPU 时，仪表盘按钮可降低绘制分辨率，再次点击恢复，不改变结构或球面网格。
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
