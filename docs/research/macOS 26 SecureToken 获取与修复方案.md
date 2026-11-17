# macOS 26 SecureToken 获取与修复方案

> 导出自 Google Gemini 深度研究 (Deep Research)
> 导出时间: 2026-11-13 00:15:32

# macOS 26 (Tahoe) SecureToken 信任链断裂、主动获取机制与设备失活死锁全栈解决方案

在搭载 Apple Silicon 芯片及运行 **macOS 26 (Tahoe)** 的设备上，当系统处于“无有效加密用户”状态时，通过脚本、命令行（如 `dscl` 或未附带现有令牌凭证的 `sysadminctl -addUser`）或 MDM 预阶段（PreStage）人工创建的本地账户，不会自动完成安全隔区（Secure Enclave）的密钥封装（Key Wrapping），因此运行 `sysadminctl -secureTokenStatus` 会显示为 `DISABLED` [^1]。此类账户仅具备传统 POSIX 意义上的 `sudo` 权限，在 macOS 密码学信任链中属于“名义管理员”，**不具备卷宗所有者（Volume Owner）身份** [^1]。当您登录该无令牌账户并通过“系统设置 > 用户与群组”图形界面（UI）新建第二个管理员时，由于解锁设置面板的当前账户自身缺乏 SecureToken，macOS 无法完成信任链传递，新建的管理员同样无法获得 SecureToken [^4]。此外，Apple 自 macOS 14 Sonoma 起封堵了在存在本地用户时删除 `.AppleSetupDone` 重进设置助理（Setup Assistant）的机制，且 **macOS 26 Tahoe** 重构了引导令牌（Bootstrap Token）与设置助理架构（在设备管理注册阶段、本地用户创建之前即提前生成 Bootstrap Token，并在 26.4+ 默认开启 FileVault），因此早期版本中依靠“切换新账户触发 Setup 流程或登录弹窗授权”以及“无令牌管理员自我赋权”的做法在 macOS 26 下已不再适用 [^2]。

当整机没有任何本地账户持有 SecureToken（即没有任何本地用户具备 Volume Owner 权限）时，进入恢复模式（Recovery Mode）运行 `resetpassword` 会因为找不到可验证的卷宗所有者而报错（如 `This volume has no admin users to authenticate` 或 `No administrator found`），导致常规密码重置失败 [^11]。此时若点击“忘记所有密码（Forgot all passwords?）”并触发 **“停用 Mac（Deactivate Mac）”**，系统会强制轮换安全隔区内的所有者身份密钥（OIK）与密钥加密密钥（KEK），直接吊销当前的本地启动策略（`LocalPolicy`） [^12]。一旦 `LocalPolicy` 被吊销，Mac 必须联网与 Apple 激活服务器完成公钥重签才能引导系统；若在此过程中未一次性重置所有账户密码，或因恢复环境下的 Wi-Fi/DNS 握手异常触发 `Failed to create activation request`，设备就会陷入“无法完成激活 -> 因无有效 LocalPolicy 无法进入系统 -> 因激活向导前置拦截而无法进入常规恢复模式工具”的三重死锁状态 [^12]。

解决该问题需采取“先解救死锁设备、再重构主动赋权流程”的双轨方案：针对当前已锁死的电脑，若需保留数据，可尝试**改用手机个人热点（USB/Wi-Fi）或 USB-C 有线网卡突破激活请求失败** [^12]；若无需保留数据，可直接点击激活界面左上角菜单栏的 **`恢复助理 (Recovery Assistant) > 抹掉 Mac (Erase Mac)`**，或使用另一台 Mac 运行 **Apple Configurator 2 执行 DFU 恢复（DFU Restore）** 将安全隔区重置为出厂开箱状态以绕过激活锁死界面 [^12]。针对后续部署中主动获取 SecureToken 的需求，GitHub 开源社区（如 `freegeek-pdx/mkuser`、`Fabien Conus`、`aws/ec2-macos-init`、`rtrouton` 等项目）验证了三类核心机制：一是在系统尚无任何加密用户时，移除 `;DisabledTags;SecureToken` 标签后运行 **`dscl . -authonly <用户名> <密码>`** 立即触发首个 SecureToken 签发 [^6]；二是利用 **`sysadminctl -secureTokenOn`** 的交互式（`interactive` / `-`）或静默参数完成信任链传递 [^6]；三是在 macOS 26 Tahoe 环境下结合 **`profiles install -type bootstraptoken`** 与 MDM 配置描述文件实现静默授权 [^2]。

## 深度溯源：为什么人工建号与 macOS 26 (Tahoe) 切换账户不再自动授权？

### 1. SecureToken 与 Volume Owner 的底层密码学绑定

在采用 APFS 文件系统的现代 Mac（尤其是搭载 T2 安全芯片与 Apple Silicon 的机型）上，Apple 官方部署指南将 **SecureToken（安全令牌）** 定义为一个由用户登录密码保护并封装的密钥加密密钥（KEK，Key Encryption Key） [^2]。在 Apple Silicon 架构下，SecureToken 与 **Volume Ownership（卷宗所有权）** 被硬件级绑定在安全隔区（Secure Enclave）内：系统上第一个获得 SecureToken 的用户会自动成为首个卷宗所有者（Volume Owner） [^2]。

任何涉及底层硬件安全策略的操作——包括启用或管理 FileVault 磁盘加密、批准 macOS 软件更新与大版本升级、修改启动安全性策略（Startup Security Policy）、发起“抹掉所有内容和设置（EACS）”以及向其他账户签发新的 SecureToken——都要求执行者必须同时具备管理员权限与有效的 SecureToken（Volume Owner 身份） [^1]。没有 SecureToken 的管理员账户在 macOS 安全子系统中不具备任何密码学授权能力 [^1]。

### 2. 人工创建用户导致 SecureToken 缺失的三个技术原因

在没有现存用户的初始状态下，人工或脚本创建用户导致 `sysadminctl -secureTokenStatus` 返回 `DISABLED` 主要由以下三类机制触发：

1. **跳过 Setup Assistant 且未触发 OpenDirectory 密码验证钩子**：正常情况下，通过首次开机“设置助理（Setup Assistant）”交互式创建的第一个本地账户，会在设置密码并登录时直接触发安全隔区生成 KEK 并绑定首个 SecureToken [^2]。如果通过脚本、恢复模式终端或 MDM 预阶段跳过了设置助理中的账户创建步骤，后续通过命令行创建的账户在未完成首次交互式图形登录或 OpenDirectory 密码校验（`dscl . -authonly`）前，不会生成令牌 [^1]。
2. **`AuthenticationAuthority` 属性中被写入禁用标签**：许多自动化建号工具（如 Jamf 二进制管理账户、AWS 开源的 `ec2-macos-init` 或自定义初始化脚本）为了防止后台管理账户抢占首个 SecureToken，会在用户的目录记录中追加 `;DisabledTags;SecureToken` 属性 [^2]。一旦存在该标签，无论该用户如何登录或修改密码，macOS 都会拒绝为其生成 SecureToken [^3]。
3. **UID 小于 500 的系统级抑制**：根据 GitHub 开源项目 `freegeek-pdx/mkuser` 的文档说明，当创建的用户 UID 被设置在 `500` 以下（通常用于隐藏管理账户）时，macOS 在验证其密码时默认不会向其授予首个 SecureToken [^6]。

### 3. 为什么在 macOS 26 (Tahoe) 下“UI 新建管理员 + 切换账户”不再触发 Setup 与自动授权？

在早期 macOS 版本中，管理员常利用“在 UI 中新建管理员并切换登录”或“删除 `/var/db/.AppleSetupDone` 重新进入设置助理”的技巧来补救缺失的 SecureToken [^25]。但在 **macOS 26 (Tahoe)** 中，由于以下四项系统级机制变更，这一路径已被阻断：

- **UI 创建用户的信任链前置校验**：根据 `freegeek-pdx/mkuser` 文档与设备管理技术规范，通过“系统设置 > 用户与群组”图形界面创建新用户时，**只有当解锁该设置面板的现有管理员自身已经持有 SecureToken 时，新建用户才会自动获得 SecureToken** [^4]。当您使用自己人工创建且无 SecureToken 的账户去解锁 UI 创建新管理员时，由于源账户无令牌，新账户生来也是 `Secure token is DISABLED` [^6]。
- **macOS 26 提前生成 Bootstrap Token 改变了“零令牌”判定**：根据 Apple 官方部署文档（2026 年 11 月更新版）及 MacAdmins 针对 macOS 26 Tahoe 的架构报告，**在 macOS 26 及更高版本中，Bootstrap Token（引导令牌）的生成时机被提前至“设备管理注册阶段、任何本地用户创建之前”** [^2]。同时，自 **macOS 26.4** 起，FileVault 在设置助理阶段即被默认开启 [^9]。这意味着受管或经过初始化的 macOS 26 系统底层往往已经存在一个密码学实体（如 `MDM Bootstrap Token External Key`），系统不再处于传统意义上“无任何加密密钥”的空白状态，因此不再允许通过简单的本地创建或自签动作随意自举生成首个令牌 [^2]。
- **登录窗口授权弹窗的抑制机制**：Apple 部署参考文档指出，当系统上没有任何已启用 SecureToken 的账户可用时，用户在首次登录时**不会**收到要求输入现有管理员凭证以启用 SecureToken 的弹窗提示——因为系统内根本不存在可作为信任根（Root of Trust）的现有令牌持有者来进行担保 [^4]。
- **`.AppleSetupDone` 重入 Setup Assistant 机制失效**：根据 Apple 官方支持文档（HT214030 / 109030）及社区实测，自 macOS 14 Sonoma 起（包括 macOS 15 Sequoia 与 macOS 26 Tahoe），只要 Mac 上已存在任何本地用户账户，删除 `/private/var/db/.AppleSetupDone` **不再重新启动设置助理（Setup Assistant）** [^8]。甚至在 GitHub 开源项目 `Inetum-Poland/add2abm` 的 Issue #24 实测报告中，在开启 FileVault 的 **macOS 26.5.1 (Tahoe，Build 25F80)** Apple Silicon 设备上，即便在恢复模式下同时删除 `.AppleSetupDone` 并将 `/var/db/dslocal/nodes/Default/users/` 下所有 UID > 500 的本地用户 `.plist` 备份重命名为 `.bak` 隐藏，重启后设备也只会进入灰色登录窗口，而不会进入 Setup Assistant [^32]。

## 死锁剖析：为什么无 SecureToken 导致 resetpassword 失败并引发“无法激活/无法进恢复模式”？

当您在没有有效 SecureToken 用户的 Apple Silicon Mac 上尝试通过恢复模式终端运行 `resetpassword` 时，系统会沿着一条密码学降级路径滑入“失活死锁”。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

导致电脑“无法激活、无法进系统、恢复模式也进不了”的底层密码学链条包含四个递进阶段：

### 阶段一：常规重置因缺乏加密用户而拒绝执行

在恢复模式（Recovery Mode）下打开终端运行 `resetpassword` 时，密码重置向导的常规路径（Option A）首先需要读取 APFS 宗卷上的加密用户列表（即 `diskutil apfs listCryptoUsers /` 中的 `Local Open Directory User`） [^5]。由于人工创建的用户没有 SecureToken，APFS 容器中不存在任何有效的本地卷宗所有者，重置工具会报错提示“此宗卷上没有可验证的管理员用户（`This volume has no admin users to authenticate` 或 `No administrator found`）”，导致常规密码重置直接失败 [^11]。

### 阶段二：被迫触发“停用 Mac（Deactivate Mac）”轮换硬件密钥

当常规重置因无管理员可验证而受阻时，向导只剩下备用路径（Option B）——点击 **“忘记所有密码？（Forgot all passwords?）”** 并选择 **“停用 Mac（Deactivate Mac）”** [^12]。在 Apple Silicon 的安全设计中，当没有任何现有 Volume Owner 可以授权修改密码时，若要在不抹除整个磁盘的情况下重建卷宗所有权，系统必须通过 `Deactivate Mac` **轮换安全隔区内的所有者身份密钥（OIK，Owner Identity Key）与密钥加密密钥（KEK）** [^14]。

### 阶段三：`LocalPolicy` 被吊销与“激活 Mac”失败

根据 MacAdmins 社区对 Apple Silicon 启动架构的解析，轮换 OIK/KEK 的操作会立即使当前系统分区的本地启动策略（`LocalPolicy`）失效——用 Apple 的术语来说，这台 Mac 进入了“已停用（Deactivated）”状态 [^12]。一台处于 Deactivated 状态的 Apple Silicon Mac 必须生成一对新的特殊 `LocalPolicy` 密钥对，并通过互联网连接 Apple 激活服务器对其公钥进行重新签名（即“重新激活 Activate Mac”） [^14]。

在此环节中，两类常见原因会导致激活中断并抛出 `Failed to create activation request` 或 `Failed to Activate Device` 错误 [^12]：首先，Addigy 官方技术支持文档警告，在执行 `Deactivate Mac` 流程时，**必须为系统上的每一个本地用户全部重新设置密码**；如果只重置了其中一个用户而跳过了其他用户，所做的密码重置在重启后不会生效，并会导致设备被锁定 [^13]。其次，Apple 支持社区多位工程师指出，较新的 Apple Silicon Mac 在重启进入 `Activate Mac` 界面时，经常无法自动重连 Wi-Fi，或在特定路由器、校园网、企业内网及部分 ISP 环境下因 DNS 解析或网络握手异常无法连接 Apple 激活服务器，直接报错 `Failed to create activation request` 或 `server with the specified hostname could not be found` [^12]。

### 阶段四：正常系统与恢复模式的双向封锁

一旦卡在 `Activate Mac` 界面，由于旧的 `LocalPolicy` 已被吊销而新的 `LocalPolicy` 尚未获得 Apple 服务器签名，设备便无法引导任何已安装的 macOS 系统；若尝试在启动磁盘工具中将 `Macintosh HD` 设为启动磁盘，系统会报错 `No administrator found` 与 `Authentication failed`（或 `Unable to set startup disk`） [^12]。同时，每次开机长按电源键尝试进入 `Options`（恢复模式）时，恢复助理（Recovery Assistant）都会在加载常规四宫格恢复工具（磁盘工具、终端、重装系统）之前**强制拦截并直接跳转到 `Activate Mac` 激活向导**，从而呈现出“既进不了系统、也进不了恢复模式”的死锁状态 [^12]。

## 紧急救援：如何解救当前“无法激活、无法进系统、无法进恢复模式”的 Mac？

针对目前已经陷入 `Activate Mac` 死循环且无法进入常规恢复工具的电脑，请根据“是否必须保留内部未备份数据”，按从轻到重的顺序执行以下三种解救方案：

### 方案一：突破“Activate Mac”网络与账号拦截（保留数据首选）

根据 Apple 支持社区针对 M 系列芯片误点 `Deactivate Mac` 后卡在 `Failed to create activation request` 的案例分析，此时内部 SSD 的用户数据并未被抹除，只是卡在 `LocalPolicy` 在线重签环节 [^12]。请依次执行以下步骤：

1. **切换为手机移动数据个人热点或 USB-C 有线以太网**：
多位遭遇相同报错的用户在 Reddit 与 Apple 社区反馈，尽管恢复助理右上角显示 Wi-Fi 已连接，但底层激活请求仍会持续失败；将网络切换为 **iPhone 个人热点（通过 USB 线缆共享或 Wi-Fi 连接移动数据）**，或使用 **USB-C 转以太网转换器直接连接路由器网线**并重启设备后，激活请求即可顺利通过 [^12]。若条件允许，也可尝试重启路由器或更换不同运营商（ISP）的网络环境 [^12]。
2. **在其他设备上提前接受 iCloud 更新条款**：
如果该 Mac 关联了 Apple ID，而该账号恰好存在尚未确认的 iCloud 新版服务条款（Terms and Conditions），恢复助理在激活或重置密码时会因无法正常渲染条款勾选框而卡死 [^36]。请在另一台 iPhone、iPad 或电脑浏览器上登录 `icloud.com` 或 Apple 账户设置，同意所有弹出的服务条款，然后重启故障 Mac 重新执行激活流程 [^36]。
3. **重置全部本地账户密码**：
一旦网络打通并通过激活校验，如果系统再次进入 `resetpassword` 密码重置列表，请务必遵循 Addigy 技术规范，**为列表中的每一个本地用户逐一设置新密码**，切勿只重置单个账户后直接重启 [^13]。

### 方案二：通过左上角菜单栏调用“抹掉 Mac”（无需第二台电脑，会清除数据）

如果您不需要保留盘内数据，只想让电脑恢复正常可用，且手头没有第二台 Mac，**无需进入常规四宫格恢复模式，直接在卡住的 `Activate Mac`（或 `Activation Failed`）界面即可彻底重置宗卷组** [^18]：

1. 在卡住的 `Activate Mac` 或 `Activation Failed` 界面，将光标移至屏幕**最左上角菜单栏**，点击 **`恢复助理 (Recovery Assistant)`** [^18]。
2. 在下拉菜单中点击 **`抹掉 Mac... (Erase Mac...)`**，并在随后的确认弹窗中点击确认抹掉 [^18]。
3. 该操作会抹除整机损坏的 APFS 宗卷组（Volume Group）及残留的无令牌用户记录 [^11]。设备自动重启后会再次进入 `Activate Mac` 窗口，此时连接右上角 Wi-Fi（或手机热点）等待数分钟即可完成正常激活，随后点击 **`退出到恢复实用工具 (Exit to Recovery Utilities)`** 重新安装 macOS [^18]。

### 方案三：使用第二台 Mac 通过 Apple Configurator 2 执行 DFU 恢复（硬件级破局）

如果左上角菜单无响应，或更换手机热点后依然持续报错 `Failed to Activate Device`（有时由 Apple 激活服务端状态异常或本地固件锁死引发），社区验证可靠的破局方案是使用另一台 Mac 进行 **DFU 模式刷机** [^18]。

在执行 DFU 操作前，需准备一台运行 **macOS 15.7+ Sequoia（需安装 Apple Configurator v2.19）或 macOS 26.x Tahoe** 的宿主 Mac，并使用支持数据传输的 USB-C 线缆连接故障 Mac [^12]。在 Apple Configurator 中存在两种操作模式，其效果差异显著：

| DFU 操作模式 | 对内部 SSD 数据的影响 | 对 Activate Mac 死锁的实际解决效果 | 适用场景建议 |
| --- | --- | --- | --- |
| DFU Revive（唤醒） | 保留用户数据：仅重刷安全隔区固件、iBoot 与恢复分区（RecoveryOS）。 | 效果有限：Apple 社区支持专家指出可尝试用其修复恢复环境，但多位 Reddit 实测用户反馈 DFU Revive 无法解除此激活报错。 | 仅在内部有极其重要且未备份的数据、且网络排查无效时作为抢救性尝试（或交由 Apple Store 尝试目标磁盘模式抢救）。 |
| DFU Restore（恢复） | 彻底清除所有数据：擦除内部所有 APFS 容器并刷入完整 IPSW 固件。 | 彻底解决死锁：实测表明 DFU Restore 会将机器彻底重置为出厂开箱状态（Out-of-the-Box Status），刷完重启后甚至不会再出现 Activate this Mac 拦截界面，直接进入全新系统。 | 当允许抹盘重装、且常规激活/抹掉均失效时的终极解决方案。 |

## GitHub 最佳实践：如何使用 sysadminctl -secureTokenOn 与底层工具主动获取 SecureToken？

为了防止再次出现“人工创建用户无 SecureToken”导致的系统死锁，下文汇总了 GitHub 上主流 MacAdmin 开源项目（包括 `freegeek-pdx/mkuser`、`Fabien Conus`、`Yohan460/Automatic-Secure-Token-Granting-Workflow`、`aws/ec2-macos-init` 以及 `rtrouton`/`zoocoup` 的技术 Gist）中主动获取和传递 SecureToken 的参数实现与 macOS 26 适配方案 [^6]。

> 📊 **[交互式可视化图表/组件: 系统拓扑与数据流图]**

### 1. `sysadminctl -secureTokenOn` 的四种核心参数模式

在 GitHub 的各大管理脚本（如 `rtrouton`、`zoocoup`、`sgmills`、`Yohan460`、`daveyboymath` 等仓库）中，`sysadminctl -secureTokenOn` 根据执行上下文（后台静默脚本、终端手动交互或 GUI 弹窗）共有四种标准参数组合 [^22]：

| 模式名称 | 完整命令语法示例 | 适用场景与安全特性 | macOS 26 (Tahoe) 兼容性状态 |
| --- | --- | --- | --- |
| 模式 A：全参数非交互式（自动化脚本常用） | sudo sysadminctl -adminUser <现有令牌管理员> -adminPassword '<管理员密码>' -secureTokenOn <目标用户> -password '<目标用户密码>' | 适用于 MDM 策略或自动化脚本后台静默赋权；缺点是明文密码会暴露在命令行历史或进程列表（ps）中。 | 完全支持（前提是 -adminUser 已持有有效令牌，在 Tahoe 26.2 实测通过） |
| 模式 B：连字符 - 终端安全输入模式（推荐手动执行） | sudo sysadminctl -adminUser <现有令牌管理员> -adminPassword - -secureTokenOn <目标用户> -password - | 使用 - 代替密码参数，命令会在 CLI 终端内依次提示隐藏输入管理员密码与目标用户密码，防止密码写入 Shell 历史记录或进程列表。 | 完全支持（注意：通过 stdin 传入的管理员密码长度不可超过 1022 字节） |
| 模式 C：interactive 图形弹窗验证模式 | sudo sysadminctl interactive -secureTokenOn <目标用户> -password - | 必须在本地 GUI 登录会话中运行（不可通过远程屏幕共享或纯 SSH 触发）；interactive 参数会唤起 macOS 原生 GUI 认证窗口（支持 Touch ID 或密码解锁），随后在终端提示输入目标用户密码。 | 完全支持（适合本地技术支持人员在用户桌面操作） |
| 模式 D：无令牌系统“自我赋权”技巧（Self-Grant） | sudo sysadminctl -adminUser <管理账户> -adminPassword '<密码>' -secureTokenOn <同一管理账户> -password '<密码>' | 当整机没有任何账户持有 SecureToken 时，将 -adminUser 与 -secureTokenOn 指定为同一个本地管理员自己给自己签发令牌。 | 自 macOS 26 Tahoe 起在无用户/受管环境中失效（详见下方解析） |

#### 关键避坑：为什么“模式 D（自我赋权）”在 macOS 26 (Tahoe) 中会失效？

在 macOS 11 至 macOS 15 时代，瑞士教育网系统管理员 Fabien Conus 及 Swif.ai 等团队在 GitHub 与技术文档中广泛采用一套“无令牌环境下管理员自我赋权”脚本：当系统没有任何人持有 SecureToken 时，本地管理员可以通过把自己的账号密码同时填进 `-adminUser` 和 `-secureTokenOn` 来直接为自己激活首个令牌 [^10]。

然而，Fabien Conus 在 2026 年 8 月 31 日的博客更新中明确指出：**这一“自签技巧”自 macOS 26 Tahoe 起已不再工作** [^10]。结合 Apple 官方部署文档分析，其根源在于 macOS 26 在设备管理注册阶段（创建任何用户之前）就已经提前生成了 Bootstrap Token，并在 26.4+ 默认准备了 FileVault 加密上下文 [^2]。此时系统底层已经存在受保护的密钥槽，不再允许无令牌的本地管理员通过 `sysadminctl` 凭空自签，强行运行会直接返回错误：
`Operation is not permitted without secure token unlock` [^1]。

### 2. GitHub 方案一：在“无任何令牌用户”时，使用 `dscl . -authonly` 主动触发首个 SecureToken

如果您是在**尚未生成任何加密用户**的机器上，通过命令行或脚本人工创建了第一个管理员（UID ≥ 500），如何不登录 GUI 界面就主动让它拿到首个 SecureToken？

GitHub 上知名的 macOS 用户创建工具 **`freegeek-pdx/mkuser`**（已于 2026 年 9 月发布 `v2026.9.11-1`，支持至 macOS 27 Golden Gate）以及 AWS 官方开源的 **`aws/ec2-macos-init`** 给出了底层的标准实现逻辑 [^6]。根据 `mkuser` 与 `Travelling Tech Guy` 的文档说明，在 macOS 11 Big Sur 及更高版本中，只要系统上还没有任何 SecureToken 持有者，macOS 会在**第一个本地账户设置密码或通过 OpenDirectory 验证密码时**，自动为其签发首个 SecureToken [^3]。人工建号之所以没拿到令牌，通常是因为创建过程中被加上了 `;DisabledTags;SecureToken`，或者创建完毕后尚未执行过一次 OpenDirectory 密码认证 [^3]。

假设您人工创建的管理员用户名为 `myadmin`（且 UID ≥ 500），可在终端按顺序执行以下四步主动获取首个令牌：

1. **检查并移除禁止生成令牌的标签**（参考 `aws/ec2-macos-init/lib/ec2macosinit/usermanagement.go` 实现） [^21]：

Bash

```
# 查看当前用户的 AuthenticationAuthority 属性是否包含 ;DisabledTags;SecureToken
dscl . -read /Users/myadmin AuthenticationAuthority

# 如果包含该禁用标签，必须先将其删除，否则改密或认证均不会生成令牌
sudo dscl . -delete /Users/myadmin AuthenticationAuthority ";DisabledTags;SecureToken"
```
2. **重新通过 `dscl` 设置一次密码以触发密钥生成逻辑** [^6]：

Bash

```
sudo dscl . -passwd /Users/myadmin 'YourStrongPassword123!'
```
3. **执行 `dscl . -authonly` 主动触发首个 SecureToken 落盘**（参考 `freegeek-pdx/mkuser` 文档说明：在用户创建完成后手动运行 `dscl . -authonly` 可立即向该管理员授予首个 SecureToken） [^6]：

Bash

```
dscl . -authonly myadmin 'YourStrongPassword123!'
```
4. **立即验证 SecureToken 与 Volume Owner 状态** [^1]：

Bash

```
sysadminctl -secureTokenStatus myadmin
sudo diskutil apfs listCryptoUsers /
```

验证通过后，`sysadminctl` 会输出 `Secure token is ENABLED for user myadmin`，且 `listCryptoUsers` 中会出现该用户的 UUID 并标记为 `Volume Owner: Yes` [^5]。

此外，如果您需要在脚本或终端中从零创建第一个管理员并确保其合规获得令牌，也可直接调用 `freegeek-pdx/mkuser`（它会自动规避 244 字节账户名限制及点号前缀导致的 UID 分配 Bug），并在创建后运行 `dscl . -authonly` [^6]：

Bash

```
sh <(curl -sL run.mkuser.sh) --admin --password-prompt myadmin
dscl . -authonly myadmin
```

### 3. GitHub 方案二：在 macOS 26 (Tahoe) 下利用 Bootstrap Token 主动赋权

如果您的设备运行 **macOS 26 Tahoe** 且处于 MDM 纳管环境（如 Jamf Pro、Microsoft Intune、Omnissa Workspace ONE、Addigy 等），由于 macOS 26 已经在设备管理注册阶段提前生成了 Bootstrap Token [^2]，您应当通过 **Bootstrap Token 管道** 让人工或预阶段创建的账户获取 SecureToken：

1. **检查 Bootstrap Token 托管状态** [^2]：

Bash

```
sudo profiles status -type bootstraptoken
```

如果输出显示 `Bootstrap Token supported on server: YES` 且 `Bootstrap Token escrowed to server: YES` [^52]，说明 MDM 已经持有引导令牌，且 Bootstrap Token 已在底层具备 Volume Owner 权限 [^2]。
2. **通过登录窗口（Login Window）交互式登录触发自动签发**：
根据 Factorial HR 与 Addigy 的技术文档，在 Bootstrap Token 已成功托管的前提下，由管理策略或脚本创建的无令牌管理员账户**只需在 Mac 的图形登录窗口（Login Window）手动输入密码登录一次**（注意：通过 `ssh`、后台脚本、`su` 或 `sudo` 登录均不会触发令牌签发） [^4]。登录瞬间，macOS 会向 MDM 请求 Bootstrap Token 并自动为该账户签发 SecureToken 与 Volume Owner 权限 [^2]。
3. **macOS 26.4+ 无人值守零接触赋权（通过 FileVault 描述文件直接授权）**：
根据 Apple 针对 **macOS 26.4 及更高版本** 的官方部署指南（2026 年 9 月更新），在无人值守部署场景（账户由设备管理服务在注册期间创建）中，管理员只需在 MDM 下发的 **FileVault 配置描述文件（Configuration Profile）** 中提供该现有用户账户的用户名与密码，并**关闭延迟启用（Turn off deferred enablement）**，macOS 26.4+ 就会直接调用 Bootstrap Token 自动为该账户授予 SecureToken 并开启 FileVault，无需等待用户手动切换登录 [^9]。
4. **若已有令牌用户但 Bootstrap Token 未托管（使用 `expect` 补交脚本）**：
如果机器上已有一个本地用户拿到了 SecureToken，但 `profiles status -type bootstraptoken` 显示 `escrowed to server: NO`，可使用 Fabien Conus 在 GitHub 公开的 `expect` 脚本将 Bootstrap Token 补交至 MDM 服务器，使后续所有新建管理员在登录时自动获得授权 [^2]：

Bash

```
sudo expect -c "spawn /usr/bin/profiles install -type bootstraptoken; expect \"Enter the admin user name:\"; send -- \"现有令牌管理员\r\"; expect \"Enter the password for user*\"; send -- \"管理员密码\r\"; expect eof"
```

### 4. GitHub 方案三：修复令牌损坏或密码失步（`-secureTokenOff` / `-secureTokenOn` 循环）

如果您的管理员账户曾经拥有 SecureToken，但由于在终端中直接使用 `passwd` 或 `dscl . -passwd` 强行修改了密码，导致本地密码哈希与安全隔区内的 KEK 失步（表现为安装软件更新时报错 `Authentication is disabled`，或系统设置 GUI 弹窗拒绝接受正确的管理员密码） [^43]，请登录另一位持有有效 SecureToken 的管理员，执行“先关闭再开启”的同步命令并刷新 Preboot 宗卷 [^43]：

Bash

```
# 1. 先关闭目标账户的旧令牌（清除失步的 KEK 绑定）
sudo sysadminctl -secureTokenOff <故障用户名> -password - -adminUser <正常令牌管理员> -adminPassword -

# 2. 重新为目标账户开启令牌（使用当前新密码重新封装 KEK）
sudo sysadminctl -secureTokenOn <故障用户名> -password - -adminUser <正常令牌管理员> -adminPassword -

# 3. 强制同步更新 APFS Preboot 预启动宗卷中的加密用户记录
sudo diskutil apfs updatePreboot /
```

## 诊断与防呆清单：如何审计 APFS 加密用户与 Volume Owner 状态？

为了防止再次因“无 SecureToken 账户去执行重置密码或系统更新”而把电脑锁入激活死循环，在任何 macOS 26 设备交付、改密或进入恢复模式操作前，建议在终端按顺序执行以下四项核验与防护步骤 [^1]：

1. **核查指定用户的 SecureToken 状态**：
运行 `sysadminctl -secureTokenStatus <用户名>`，确认输出为 `Secure token is ENABLED for user <用户名>` [^1]。请注意，切勿在终端手动执行 `sudo dscl . -append /Users/<用户名> AuthenticationAuthority ";SecureToken;"`——Jamf 社区实测指出，手动追加该字符串只会制造一个“假阳性（False-Positive）”状态标记，并不会在安全隔区真正生成密钥，反而会进一步破坏系统状态 [^59]。
2. **核查底层 APFS 宗卷的加密用户与 Volume Owner（硬件级检查）**：
运行 `sudo diskutil apfs listCryptoUsers /`（或 `sudo diskutil apfs listUsers /`）查看根宗卷上的所有密码学实体及其 UUID [^1]。在健康的系统中，除了代表 FileVault 恢复密钥的 `Type: Personal Recovery User` 和代表 MDM 引导令牌的 `Type: MDM Bootstrap Token External Key` 外，**必须至少存在一个 `Type: Local Open Directory User` 且显示 `Volume Owner: Yes`** [^5]。如果输出中没有任何 `Local Open Directory User`，说明当前没有任何本地用户拥有卷宗所有权，此时进入恢复模式运行 `resetpassword` 必然无法通过常规管理员验证 [^1]。
3. **将 `listCryptoUsers` 中的 UUID 反查为具体用户名**：
使用 `dscl . -search /Users GeneratedUID <填入上方查到的UUID> | awk '{print $1}' | head -n 1` 将加密列表中的 UUID 映射回具体的本地用户名，或者直接运行 `sudo fdesetup list -extended` 一并查看所有加密用户名、UUID 及权限类型 [^2]。
4. **严守最后一个令牌持有者的改密与删除底线**：
尽管 `sysadminctl` 和“系统设置”内置了防止直接删除最后一个管理员或最后一个 SecureToken 用户的保护机制 [^2]，但它们无法阻止管理员在命令行使用 `passwd` 或通过 MDM 远程强行重置最后一个 SecureToken 用户的密码 [^54]。CyberArk 与 Addigy 等安全厂商均明确警告：**绝不要在没有第二个 SecureToken 管理员或未托管 Bootstrap Token 的情况下，使用命令行强行重置唯一令牌持有者的密码**，否则会直接打碎整机唯一的 KEK 信任链 [^61]。在通过脚本创建首个管理员后，务必立即执行 `dscl . -authonly <用户名> <密码>` 或在图形登录窗口完成一次真实登录，确认 `Local Open Directory User` 已落盘后再交付使用 [^4]。

---

## 📚 参考文献与引用源

1. [**netnxt.com**｜macOS Admin Has No Secure Token? Here Is the Fix - NetNXT](https://netnxt.com/blog/macos-admin-no-secure-token-fix)
2. [**support.apple.com**｜Use secure token, bootstrap token, and volume ownership in](https://support.apple.com/en-is/guide/deployment/dep24dbdcf9e/web)
3. [**travellingtechguy.blog**](https://travellingtechguy.blog/filevault-securetoken-and-bootstrap-in-macos-11-0-1-big-sur/)
4. [**help.factorialhr.com**｜SecureToken rules - Factorial Help Center](https://help.factorialhr.com/en_US/device-management/securetoken-rules)
5. [**derflounder.wordpress.com**](https://derflounder.wordpress.com/2023/03/10/granting-volume-owner-status-on-apple-silicon-macs/)
6. [**github.com**｜GitHub - freegeek-pdx/mkuser: Make user accounts for macOS with](https://github.com/freegeek-pdx/mkuser)
7. [**mrmacintosh.com**｜Apple releases long-awaited SecureToken documentation](https://mrmacintosh.com/securetoken-documentation/)
8. [**discussions.apple.com**｜Unfamiliar login screen loads more and more since Tahoe 26 update](https://discussions.apple.com/thread/256154303)
9. [**support.apple.com**｜Manage FileVault with device management - Apple Support (AZ)](https://support.apple.com/en-az/guide/deployment/dep0a2cb7686/web)
10. [**fabien.iconus.ch**｜Secure token and bootstrap token in a user-less environment](https://fabien.iconus.ch/secure-token-and-bootstrap-token-in-a-user-less-environment/)
11. [**reddit.com**｜macOS Recovery - This Volume has no admin users to authenticate](https://www.reddit.com/r/macsysadmin/comments/ovwdqn/macos_recovery_this_volume_has_no_admin_users_to/)
12. [**discussions.apple.com**｜MacBook Air M3 stuck on "Activate Mac" af… - Apple Community](https://discussions.apple.com/thread/256327481)
13. [**support.addigy.com**｜Fixing Broken Keychains (Secure Tokens) using Recovery Mode](https://support.addigy.com/hc/en-us/articles/4406215343763-Fixing-Broken-Keychains-Secure-Tokens-using-Recovery-Mode)
14. [**reddit.com**｜So is there actually a way to change/reset the password for a local](https://www.reddit.com/r/macsysadmin/comments/xlmqe9/so_is_there_actually_a_way_to_changereset_the/)
15. [**reddit.com**｜[HALP PLS] "No admin users found in the primary OS. Cannot](https://www.reddit.com/r/AsahiLinux/comments/1dv71k0/halp_pls_no_admin_users_found_in_the_primary_os/)
16. [**reddit.com**｜m1 Mac stuck in activation mode after admin password reset - Reddit](https://www.reddit.com/r/mac/comments/1r32yh9/m1_mac_stuck_in_activation_mode_after_admin/)
17. [**discussions.apple.com**｜Failed to create activation request - Apple Support Community](https://discussions.apple.com/thread/255227571)
18. [**reddit.com**｜Stuck at "Activate Mac", always "Failed to Activate Device ... - Reddit](https://www.reddit.com/r/mac/comments/1fb5w1f/stuck_at_activate_mac_always_failed_to_activate/)
19. [**discussions.apple.com**｜How to activate mac if I get the error "F… - Apple Community](https://discussions.apple.com/thread/255860281)
20. [**iclarified.com**｜How to Fix 'Computer Account Creation Failed' During macOS Big](https://www.iclarified.com/81387/how-to-fix-computer-account-creation-failed-during-macos-big-sur-install)
21. [**github.com**](https://github.com/aws/ec2-macos-init/blob/master/lib/ec2macosinit/usermanagement.go)
22. [**gist.github.com**｜SecureToken and sysadminctl in 10.13 (based on 10.13.4) · GitHub](https://gist.github.com/zoocoup/268be15bf5164c8359441397659b5abd)
23. [**gist.github.com**｜SecureToken and sysadminctl in 10.13 (based on 10.13.2) · GitHub](https://gist.github.com/rtrouton/c9e6290b3208aea1ac2740dade2aa994)
24. [**github.com**｜Hardening Guide - macOS 26 Tahoe - GitHub](https://github.com/ernw/hardening/blob/master/operating_system/osx/26/Hardening_Guide-macOS_26_Tahoe_1.0.md)
25. [**discussions.apple.com**｜No users with secureToken on Mac OS High … - Apple Community](https://discussions.apple.com/thread/8487253)
26. [**apple.stackexchange.com**｜What is a Secure Token and how do I get an admin users that has one](https://apple.stackexchange.com/questions/313366/what-is-a-secure-token-and-how-do-i-get-an-admin-users-that-has-one)
27. [**community.jamf.com**｜Secure Token error | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/secure-token-error-33373)
28. [**downloads.lib.utah.edu**｜macOS 26](https://downloads.lib.utah.edu/media_streaming_presentation_documents/pdf/mac_mgrs/20250820_mm/2025.08.20_mm_macOS26.pdf)
29. [**support.datajar.co.uk**](https://support.datajar.co.uk/hc/en-us/articles/4409474136465-Verifying-cryptographic-users-and-volume-ownership-on-macOS-11-and-higher)
30. [**discussions.apple.com**｜enable automatic login on os 26 - Apple Community](https://discussions.apple.com/thread/256183030)
31. [**christopherrobinson.uk**｜Restoring administrator account on macOS from standard user](https://christopherrobinson.uk/blog/restoring-administrator-account-on-macos/)
32. [**github.com**｜[macOS 26.5.1 / Apple Silicon / FileVault] Login window appears](https://github.com/Inetum-Poland/add2abm/issues/24)
33. [**github.com**](https://github.com/Inetum-Poland/add2abm)
34. [**reddit.com**｜Wrong user has secureToken : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/1kh1ep9/wrong_user_has_securetoken/)
35. [**reddit.com**｜PSA: if (say) your child follows instructions found online to boot M1](https://www.reddit.com/r/MacOS/comments/176vn26/psa_if_say_your_child_follows_instructions_found/)
36. [**reddit.com**｜Mac Recovery Assistant - Can't Accept Terms and Conditions! HELP](https://www.reddit.com/r/mac/comments/10ber0d/mac_recovery_assistant_cant_accept_terms_and/)
37. [**technobezz.com**｜Mac Login Password Not Working? How to Get Back In - Technobezz](https://www.technobezz.com/how-to-fix-a-mac-login-password-that-is-not-working)
38. [**gist.github.com**｜Grant Current User Secure Token.sh - GitHub Gist](https://gist.github.com/sgmills/6a68ba11454318476d27bfc1188c7eb7)
39. [**github.com**｜GitHub - Yohan460/Automatic-Secure-Token-Granting-Workflow](https://github.com/Yohan460/Automatic-Secure-Token-Granting-Workflow)
40. [**github.com**｜Jamf/PassSecureToken.sh at MacOS · daveyboymath/Jamf - GitHub](https://github.com/daveyboymath/Jamf/blob/MacOS/PassSecureToken.sh)
41. [**community.jamf.com**｜Scripting Help - Secure Tokens | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/scripting-help-secure-tokens-34416)
42. [**alansiu.net**｜Command to add a secure token to a macOS user account](https://www.alansiu.net/2021/05/12/command-to-add-a-secure-token-to-a-macos-user-account/)
43. [**smartwatermelon.medium.com**｜When Your Mac Admin Password Isn't Accepted… Until You Reset](https://smartwatermelon.medium.com/when-your-mac-admin-password-isnt-accepted-until-you-reset-securetoken-0fab39646f0e)
44. [**reddit.com**｜Unable to REMOVE Secure Token for a user : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/15noopu/unable_to_remove_secure_token_for_a_user/)
45. [**community.jamf.com**｜Script To Assign a Secure Token and Add User to FV2 - Jamf Nation](https://community.jamf.com/general-discussions-2/script-to-assign-a-secure-token-and-add-user-to-fv2-7079)
46. [**github.com**｜Create user fails on macOS 10.13 - "Failed to authenticate ... - GitHub](https://github.com/microsoft/macos-cookbook/issues/32)
47. [**help.swif.ai**｜Resolving "Operation Not Permitted Without Secure Token Unlock](https://help.swif.ai/en/articles/10060573-resolving-operation-not-permitted-without-secure-token-unlock-error-on-mac-devices)
48. [**derflounder.wordpress.com**｜Secure Token and FileVault on Apple File System - Der Flounder](https://derflounder.wordpress.com/2018/01/20/secure-token-and-filevault-on-apple-file-system/)
49. [**github.com**](https://github.com/freegeek-pdx/mkuser/releases)
50. [**scriptingosx.com**｜Scripting OS X — Weekly News Summary for Admins — 2020-12-11](https://scriptingosx.com/2020/12/scripting-os-x-weekly-news-summary-for-admins-2020-12-11/)
51. [**soti.net**｜Using Bootstrap Token to Create Secure Tokens Automatically on](https://soti.net/mc/help/v15.5/en/console/devices/managing/enrollment/apple/macos/using_bootstrap_macOS.html)
52. [**support.addigy.com**｜FAQ: Troubleshooting FileVault - Addigy Support](https://support.addigy.com/hc/en-us/articles/4403542579603-FAQ-Troubleshooting-FileVault)
53. [**docs.omnissa.com**](https://docs.omnissa.com/macOS-Device-Management-VSaaS/FullDiskEncryptionwithFileVault)
54. [**discussions.apple.com**｜Unable to enable FileVault, no user has a secure token](https://discussions.apple.com/thread/8517171)
55. [**techhelp.towson.edu**｜"Authentication is Disabled" Mac Secure Token Issue - TechHelp](https://techhelp.towson.edu/TDClient/1879/Portal/KB/Article/155822/Authentication-is-Disabled-Mac-Secure-Token-Issue)
56. [**reddit.com**｜URGENT: Question regarding administrator password : r/MacOS](https://www.reddit.com/r/MacOS/comments/1w1mgr2/urgent_question_regarding_administrator_password/)
57. [**mrmacintosh.com**｜SecureToken Archives - Mr. Macintosh](https://mrmacintosh.com/category/securetoken/)
58. [**help.swif.ai**｜How to fix the “Secure Token could not be activated for the Swif](https://help.swif.ai/en/articles/10592287-how-to-fix-the-secure-token-could-not-be-activated-for-the-swif-admin-account-please-check-your-password)
59. [**community.jamf.com**｜Secure Token for managed administrator account - Jamf Nation](https://community.jamf.com/general-discussions-2/secure-token-for-managed-administrator-account-26241)
60. [**github.com**｜chore(vnc): validate standalone mac screen sharing auth modes](https://github.com/okou-ai/okou/issues/36817)
61. [**community.cyberark.com**｜EPM - MacOS Secure Token Explanation - CyberArk](https://community.cyberark.com/s/article/EPM-MacOS-Secure-Token-Explanation)
62. [**support.addigy.com**｜Overview: Secure Tokens and Bootstrap Tokens - Addigy Support](https://support.addigy.com/hc/en-us/articles/46851607633171-Overview-Secure-Tokens-and-Bootstrap-Tokens)
63. [**community.jamf.com**｜Script to Grant Local Admin Account a SecureToken Locks out End](https://community.jamf.com/general-discussions-2/script-to-grant-local-admin-account-a-securetoken-locks-out-end-user-9792)
64. [**knowledge.broadcom.com**｜Enabling Secure Token for FileVault operations on macOS (with](https://knowledge.broadcom.com/external/article/171048)
65. [**community.jamf.com**｜User's account not available at login after restart - Jamf Nation](https://community.jamf.com/general-discussions-2/user-s-account-not-available-at-login-after-restart-24206)
66. [**reddit.com**｜Secure Token Help : r/jamf - Reddit](https://www.reddit.com/r/jamf/comments/17m9q9s/secure_token_help/)
67. [**reddit.com**｜Insurmountable sync conflict between Mobile Account (Active](https://www.reddit.com/r/macsysadmin/comments/1v4nm2g/insurmountable_sync_conflict_between_mobile/)
68. [**community.jamf.com**｜Administrator account scrambled into Network account? | Community](https://community.jamf.com/general-discussions-2/administrator-account-scrambled-into-network-account-32451)
69. [**reddit.com**｜Macbook don't let me add stupid touchid - Reddit](https://www.reddit.com/r/macbook/comments/1wbd4a9/macbook_dont_let_me_add_stupid_touchid/)
70. [**community.jamf.com**｜Validate Local User Password | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/validate-local-user-password-8442)
71. [**github.com**｜Wrong password bug on T1 Macs running macOS 26 · Issue #605](https://github.com/oclp-t2/OpenCore-Legacy-Patcher-T2/issues/605)
72. [**bifrost.docs.renner.dev**｜Security Guide | Bifrost Proxy](https://bifrost.docs.renner.dev/security)
73. [**sudoade.com**｜Managing secrets with Addigy's data_key_client - Sudoade](https://www.sudoade.com/secure-variable-storage-and-recall-using-addigys-data_key_client/)
74. [**reddit.com**｜MacOS automated user creation on first setup with Intune - Reddit](https://www.reddit.com/r/macsysadmin/comments/10ar9j3/macos_automated_user_creation_on_first_setup_with/)
75. [**community.jamf.com**｜add user script | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/add-user-script-48343)
76. [**reddit.com**｜Admin account : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/152s41c/admin_account/)
77. [**gist.github.com**｜"rosetter" is a shell/CLI tool to enable (or disable) opening apps](https://gist.github.com/PicoMitchell/9957fad24740831ffcc848bff48d2750)
78. [**community.jamf.com**｜Okta Platform SSO + Jamf Pro PreStage on macOS 26: "Registration](https://community.jamf.com/general-discussions-2/okta-platform-sso-jamf-pro-prestage-on-macos-26-registration-failed-on-identity-first-plus-recovery-lockout-questions-59021)
79. [**discussions.apple.com**｜Disk has secure tokens, no local user! - Apple Support Community](https://discussions.apple.com/thread/256138955)
80. [**mjtsai.com**｜macOS Tahoe Beta Forces Sharing FileVault Key - Michael Tsai](https://mjtsai.com/blog/2025/06/24/macos-tahoe-beta-forces-sharing-filevault-key/)
81. [**reddit.com**｜Tahoe FileVault Prompt : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/1pk4j15/tahoe_filevault_prompt/)
82. [**derflounder.wordpress.com**｜Unlocking FileVault via SSH on macOS Tahoe – Der Flounder](https://derflounder.wordpress.com/2025/10/11/unlocking-filevault-via-ssh-on-macos-tahoe/)
83. [**fabien.iconus.ch**｜Fab's MacAdmin Tips&Tricks | Tips and tricks learned while trying to](https://fabien.iconus.ch/)
84. [**fabien.iconus.ch**｜Getting the macOS version number from the installer app](https://fabien.iconus.ch/getting-the-macos-version-number-from-the-installer-app/)
85. [**apple.stackexchange.com**｜No users are listed on any volumes, when resetting password, in](https://apple.stackexchange.com/questions/476681/no-users-are-listed-on-any-volumes-when-resetting-password-in-internet-recover)
86. [**help.swif.ai**｜Troubleshooting a Non-Admin Login Failure on FileVault-Enabled](https://help.swif.ai/en/articles/10705969-troubleshooting-a-non-admin-login-failure-on-filevault-enabled-macos)
87. [**discussions.apple.com**｜MacBook Pro M1 admin access lost, daughte… - Apple Community](https://discussions.apple.com/thread/256390037)
88. [**forums.macrumors.com**｜Locked out of password- no user account to reset! Help!!](https://forums.macrumors.com/threads/locked-out-of-password-no-user-account-to-reset-help.2040684/)
89. [**mac-help.com**｜There are no users on this volume to reset the password for.](https://www.mac-help.com/threads/there-are-no-users-on-this-volume-to-reset-the-password-for.228246/)
90. [**ifixit.com**｜SOLVED: resetting password MacBook Pro - Mac - iFixit](https://www.ifixit.com/Answers/View/543324/resetting+password+MacBook+Pro)
91. [**apple.stackexchange.com**｜The `resetpassword` utility is failing to find users on the selected drive](https://apple.stackexchange.com/questions/373267/the-resetpassword-utility-is-failing-to-find-users-on-the-selected-drive)
92. [**github.com**｜Inetum Poland - GitHub](https://github.com/Inetum-Poland)
93. [**macadminpulse.com**｜add2abm: health & maintenance status - MacAdmin Pulse](https://macadminpulse.com/tools/inetum-poland--add2abm)
94. [**github.com**｜Provisional Enrollment Failed on MacBook Air A1932 (T2, Intel](https://github.com/Inetum-Poland/add2abm/issues/26)
95. [**reddit.com**｜Migrating macOS fleet from Mosyle to FleetDM with NO Apple](https://www.reddit.com/r/macsysadmin/comments/1tvd79i/migrating_macos_fleet_from_mosyle_to_fleetdm_with/)
96. [**reddit.com**｜I need help, please, with some Macs that are bound to Active Directory](https://www.reddit.com/r/macsysadmin/comments/1icvudy/i_need_help_please_with_some_macs_that_are_bound/)
97. [**mrmacintosh.com**｜Local Accounts Archives - Mr. Macintosh](https://mrmacintosh.com/category/local-accounts/)
98. [**mrmacintosh.com**｜Mojave 10.14.4+ will now sync your AD password to FileVault if](https://mrmacintosh.com/10-14-4-forgotten-active-directory-password-sync-fv2/)
99. [**community.jamf.com**｜I beg of you for SecureToken assistance. | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/i-beg-of-you-for-securetoken-assistance-21048)
100. [**reddit.com**｜New M1 Macs driving me nuts, after normal disk utility wipe ... - Reddit](https://www.reddit.com/r/macsysadmin/comments/pha6w1/new_m1_macs_driving_me_nuts_after_normal_disk/)
101. [**github.com**｜mkuser/utilities/download-and-install-mkuser.sh at main · freegeek](https://github.com/freegeek-pdx/mkuser/blob/main/utilities/download-and-install-mkuser.sh)
102. [**wikihow.com**｜How to Reset a Lost Admin Password on macOS: 4 Methods - wikiHow](https://www.wikihow.com/Reset-a-Lost-Admin-Password-on-Mac-OS-X)
103. [**discussions.apple.com**｜Cannot activate Mac after resetting password](https://discussions.apple.com/thread/254190145)
104. [**discussions.apple.com**｜Activate Mac wrong password after reset p… - Apple Community](https://discussions.apple.com/thread/255828413)
105. [**automatica.com.au**](https://automatica.com.au/2026/04/add-a-mac-to-apple-business-manager-abm-without-erasing-the-disk/)
106. [**lab.chihouzakki.com**](https://lab.chihouzakki.com/blog/review/used-intel-mac-secure-token-clean-install-safe-copy/)
107. [**reddit.com**｜Secure token woes suddenly popping up : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/1m96gko/secure_token_woes_suddenly_popping_up/)
108. [**staze.org**｜The coming Jamf LAPS Enforcement - Everybody Staze](https://www.staze.org/the-coming-jamf-laps-enforcement/)
109. [**grokipedia.com**｜Password recovery in macOS Recovery Mode - Grokipedia](https://grokipedia.com/page/Password_recovery_in_macOS_Recovery_Mode)
110. [**support.apple.com**｜Use secure token, bootstrap token, and volume ownership in](https://support.apple.com/zh-hans/guide/deployment/dep24dbdcf9e/web)
111. [**community.panopto.com**｜Recommended fix for the mk_hidden_user.sh script in the macOS](https://community.panopto.com/discussion/1931/recommended-fix-for-the-mk-hidden-user-sh-script-in-the-macos-installer-package)
112. [**community.jamf.com**｜Specify Account to Recieve Secure Token at Deployment | Community](https://community.jamf.com/general-discussions-2/specify-account-to-recieve-secure-token-at-deployment-31807)
113. [**css.csail.mit.edu**｜Apple Platform Security](https://css.csail.mit.edu/6.566/2026/readings/apple-security-may22.pdf)
114. [**repost.aws**｜如何重置我的Amazon EC2 Mac 实例的密码？ - AWS re:Post](https://repost.aws/zh-Hans/knowledge-center/ec2-macos-reset-password)
115. [**reddit.com**｜Mac Intune Enrollment - DEM via Company Portal - Reddit](https://www.reddit.com/r/Intune/comments/1n2pidr/mac_intune_enrollment_dem_via_company_portal/)
116. [**community.jamf.com**｜Does anyone know how the "Allow user to be granted first secure](https://community.jamf.com/general-discussions-2/does-anyone-know-how-the-allow-user-to-be-granted-first-secure-token-workflow-functions-34174)
117. [**apple.stackexchange.com**｜In order to continue installing, you need to be an owner](https://apple.stackexchange.com/questions/443689/installation-failed-in-order-to-continue-installing-you-need-to-be-an-owner)
118. [**community.jamf.com**｜Unable to REMOVE Secure Token from a user | Community](https://community.jamf.com/general-discussions-2/unable-to-remove-secure-token-from-a-user-30833)
119. [**intuneirl.com**｜Local Admin Password Management with Intune and Key Vault](https://intuneirl.com/modern-macos-laps-secure-local-admin-password-management-with-intune-and-azure-key-vault/)
120. [**fabien.iconus.ch**](https://fabien.iconus.ch/managing-os-updates-in-a-lab-environment-since-tahoe/?ref=macadmins.news)
121. [**fabien.iconus.ch**｜sbedit, a tool to manipulate the Finder sidebar](https://fabien.iconus.ch/sbedit-a-tool-to-manipulate-the-finder-sidebar/)
122. [**fabien.iconus.ch**｜Zero-touch, zero-user deployment | Fab's MacAdmin Tips&Tricks](https://fabien.iconus.ch/zero-touch-zero-user-deployment/)
123. [**github.com**｜Enhancement Request - parameters for admin user and ... - GitHub](https://github.com/kc9wwh/FileVaultEnableAdminAccount/issues/2)
124. [**github.com**｜support.jamf.com: code blocks emit HTML-escaped one ... - GitHub](https://github.com/GET-Technology-Inc/jamf-docs-mcp-server/issues/281)
125. [**derflounder.wordpress.com**｜Setting a user account to automatically log in using sysadminctl on](https://derflounder.wordpress.com/2023/03/04/setting-a-user-account-to-automatically-log-in-using-sysadminctl-on-macos-ventura/)
126. [**community.jamf.com**｜Give secure token to logged in user | Community - Jamf Nation](https://community.jamf.com/general-discussions-2/give-secure-token-to-logged-in-user-16729)
127. [**github.com**｜manageSecureTokens/README.md at master · TravellingTechGuy](https://github.com/TravellingTechGuy/manageSecureTokens/blob/master/README.md)
128. [**community.jamf.com**｜Unable to Login Using AD Account after reboot until logging in](https://community.jamf.com/general-discussions-2/unable-to-login-using-ad-account-after-reboot-until-logging-in-through-local-account-12290)
129. [**reddit.com**｜Can IT Support be considered as a long-term permanent career?](https://www.reddit.com/r/ITCareerQuestions/comments/ws8n34/can_it_support_be_considered_as_a_longterm/)
130. [**reddit.com**｜ITサポートって、長期的なキャリアとして考えられるのかな？ - Reddit](https://www.reddit.com/r/ITCareerQuestions/comments/ws8n34/can_it_support_be_considered_as_a_longterm/?tl=ja)
131. [**reddit.com**｜User account is locked at login : r/jamf - Reddit](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/)
132. [**reddit.com**｜Gebruikersaccount is vergrendeld bij het inloggen : r/jamf - Reddit](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/?tl=nl)
133. [**reddit.com**｜Обліковий запис користувача заблоковано під час входу : r/jamf](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/?tl=uk)
134. [**reddit.com**｜ログイン時にユーザーアカウントがロックされています : r/jamf](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/?tl=ja)
135. [**reddit.com**｜Brugerens konto er låst ved login : r/jamf - Reddit](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/?tl=da)
136. [**reddit.com**｜Korisnički nalog je zaključan prilikom prijave : r/jamf - Reddit](https://www.reddit.com/r/jamf/comments/1rkysdq/user_account_is_locked_at_login/?tl=sr)
137. [**support.apple.com**｜Platform Single Sign-on for Mac - Apple Support (QA)](https://support.apple.com/en-qa/guide/deployment/dep7bbb05313/web)
138. [**osxdaily.com**｜Mac Doesn't Have Admin Account in macOS Monterey or Big Sur](https://osxdaily.com/2022/03/25/no-admin-account-mac-fix-macos/)
139. [**reddit.com**｜Mac login password reset for locked user account - Reddit](https://www.reddit.com/r/macsysadmin/comments/1kg676k/mac_login_password_reset_for_locked_user_account/)
140. [**support.apple.com**｜Manage FileVault with device management - Apple Support (HK)](https://support.apple.com/en-hk/guide/deployment/dep0a2cb7686/web)
141. [**reddit.com**｜Secure Token issue on all apple silicon / MacOS Sonoma macbooks.](https://www.reddit.com/r/macsysadmin/comments/1dn7s53/secure_token_issue_on_all_apple_silicon_macos/)
142. [**reddit.com**｜Recovery is trying to change system settings. No Administrator Found](https://www.reddit.com/r/macsysadmin/comments/1jklv5p/recovery_is_trying_to_change_system_settings_no/)
143. [**discussions.apple.com**｜Startup Security Utility, no administrator found, The Recovery Server](https://discussions.apple.com/thread/255226396)
144. [**fabien.iconus.ch**｜Secure token | Fab's MacAdmin Tips&Tricks](https://fabien.iconus.ch/category/secure-token/)
145. [**fabien.iconus.ch**｜Fabien | Fab's MacAdmin Tips&Tricks](https://fabien.iconus.ch/author/fabieniconus-ch/)
146. [**macadmins.news**｜417: San Francisco Bay Blues - MacAdmins.news](https://www.macadmins.news/417/)
147. [**fabien.iconus.ch**｜Updates - Fab's MacAdmin Tips&Tricks](https://fabien.iconus.ch/category/updates/)
148. [**gist.github.com**｜Secure Token Management #deployment · GitHub](https://gist.github.com/PWmercy/e6dc5adc1d6aa136c09d2990519ad621)
149. [**roundfleet.com**｜Manage FileVault Encryption on macOS — Tutorial - Roundfleet](https://www.roundfleet.com/tutorial/2025-07-07-manage-filevault-encryption-macos)
150. [**linuxguideandhints.com**｜FreeIPA - Linux Guide and Hints](https://linuxguideandhints.com/el/freeipa/)
151. [**roundfleet.com**｜Tutorial - Roundfleet](https://www.roundfleet.com/tutorial)
152. [**skillsdirectory.com**｜Macos Mdm Deployment (Grade A) - Claude Skill - Skills Directory](https://www.skillsdirectory.com/skills/chrishuffman5-macos-mdm-deployment)
153. [**reddit.com**｜FileVault SSO Issue : r/macsysadmin - Reddit](https://www.reddit.com/r/macsysadmin/comments/1nnq7rz/filevault_sso_issue/)
154. [**apple.stackexchange.com**｜time machine - Ask Different - Apple Stack Exchange](https://apple.stackexchange.com/questions/408604/mysterious-login-password-woes-after-migrating-to-catalina)
155. [**downloads.lib.utah.edu**｜16-09-2026 Platform SSO State of the Union - University of Utah ...](https://downloads.lib.utah.edu/media_streaming_presentation_documents/pdf/mac_mgrs/2026.09.16_mm/2026.09.16_platform_sso_state_of_the_union_arek_dreyer.pdf)
156. [**learn.microsoft.com**｜Set up local admin account creation and password management for ...](https://learn.microsoft.com/en-us/intune/device-security/laps/setup-macos)
157. [**github.com**](https://github.com/elemenno/macOS-Secure-Token-FileVault-Reset/blob/main/secure_token%2Bfilevault_reset%202.bash)
158. [**github.com**](https://github.com/TravellingTechGuy/manageSecureTokens/blob/master/manageSecureTokens.sh)
159. [**hexnode.com**｜Mac secure token - Everything IT admins should know - Hexnode](https://www.hexnode.com/blogs/mac-secure-token-everything-it-admins-should-know/)
160. [**automox.com**｜Verify Secure Token on Apple Silicon Macs - Automox](https://www.automox.com/worklets/m1-token-check)
161. [**dcbuild.byu.edu**｜Knowledge Base - FHSS Portal - BYU](https://dcbuild.byu.edu/fhss?id=kb_article&sys_id=eb1cc9581bd2a6508082ebd1b24bcb1a)
162. [**reddit.com**｜Comprehensive How-To for granting Secure Token to a currently](https://www.reddit.com/r/macsysadmin/comments/pc8g1h/comprehensive_howto_for_granting_secure_token_to/)
163. [**support.apple.com**｜Use secure token, bootstrap token, and volume ownership in](https://support.apple.com/en-kz/guide/deployment/dep24dbdcf9e/web)
164. [**kb.filewave.com**｜Bootstrap Token Management on macOS - FileWave KB](https://kb.filewave.com/books/macos/page/bootstrap-token-management-on-macos)
165. [**mostlymac.blog**｜Using a Self Service Policy to Grant End Users a Secure Token](https://mostlymac.blog/2021/06/09/using-a-self-service-policy-to-grant-end-users-a-secure-token/)
166. [**community.jamf.com**｜Secure Token not getting assigned to first user who logs in](https://community.jamf.com/general-discussions-2/secure-token-not-getting-assigned-to-first-user-who-logs-in-34168)
167. [**discussions.apple.com**｜Error unlocking APFS Volume: The external… - Apple Community](https://discussions.apple.com/thread/250245274)
168. [**iru.com**｜Apple's Recent Updates to Platform SSO: What Problems Will It Solve?](https://www.iru.com/blog/apples-recent-updates-platform-sso)
169. [**community.jamf.com**｜Issue Observed After macOS Security Update | Community](https://community.jamf.com/india-apple-admins-47/issue-observed-after-macos-security-update-58700)
170. [**gist.github.com**｜EC2 Mac Tuning Tips · GitHub](https://gist.github.com/thimslugga/17adbee3c45713594c091e80ecd0cf69)
171. [**discussions.apple.com**｜Search broken after Sequoia upgrade - Apple Support Community](https://discussions.apple.com/thread/255825544)
172. [**support.addigy.com**｜FileVault Error: Authentication Server Failed To Complete The](https://support.addigy.com/hc/en-us/articles/7147838477587-FileVault-Error-Authentication-Server-Failed-To-Complete-The-Requested-Operation)
173. [**support.addigy.com**｜Updating Keychains with Addigy](https://support.addigy.com/hc/en-us/articles/4403542664467-Updating-Keychains-with-Addigy)
174. [**support.addigy.com**｜Addigy Identity Troubleshooting](https://support.addigy.com/hc/en-us/articles/46228092448275-Addigy-Identity-Troubleshooting)
175. [**grokipedia.com**｜macOS user password reset - Grokipedia](https://grokipedia.com/page/macOS_user_password_reset)
176. [**forums.macrumors.com**｜iMac Rest Password | MacRumors Forums](https://forums.macrumors.com/threads/imac-rest-password.2449687/)
177. [**support.addigy.com**｜Why a Local macOS User Cannot Change Their Account Password](https://support.addigy.com/hc/en-us/articles/5370744468883-Why-a-Local-macOS-User-Cannot-Change-Their-Account-Password)
178. [**discussions.apple.com**｜Failed to create activation request - Apple Support Community](https://discussions.apple.com/thread/255778457)
179. [**discussions.apple.com**｜Stuck in activation lock with a MacBook that has NO Apple ID setup](https://discussions.apple.com/thread/255334741)
180. [**discussions.apple.com**｜Failed to create activation request - Apple Support Community](https://discussions.apple.com/thread/255405771)
181. [**diligex.com**｜Find Secure Token Users For macOS - Diligex](https://diligex.com/2024/05/find-secure-token-users-for-macos/)
182. [**jamf.com**｜Jamf Connect, Big Sur, and Bootstrap Tokens: A Love Story](https://www.jamf.com/blog/jamf-connect-big-sur-and-bootstrap-tokens-a-love-story/)

