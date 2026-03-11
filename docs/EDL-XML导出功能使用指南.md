# EDL/XML 导出功能使用指南

## 功能说明

EDL (Edit Decision List) 和 FCPXML 是视频编辑行业的标准项目交换格式，用于在不同的视频剪辑软件之间传递剪辑信息。

BigBanana AI Director 支持将项目导出为这两种格式，让你可以在专业剪辑软件中进一步编辑和精修。

---

## 支持的格式

### EDL (Edit Decision List)
- **格式类型**: 纯文本格式
- **文件扩展名**: `.edl`
- **适用软件**:
  - Adobe Premiere Pro
  - DaVinci Resolve
  - Avid Media Composer
  - Sony Vegas Pro
  - Final Cut Pro（通过转换）

### FCPXML (Final Cut Pro XML)
- **格式类型**: XML 格式
- **文件扩展名**: `.fcpxml`
- **适用软件**:
  - Final Cut Pro（原生支持）
  - DaVinci Resolve（完美支持）
  - Adobe Premiere Pro（通过 XML 导入）
  - Avid Media Composer（通过转换）

---

## 使用步骤

### 1. 准备工作

在导出 EDL/XML 之前，确保：

- ✅ 已完成所有镜头的视频生成
- ✅ 至少有一个镜头的视频已生成完成
- ✅ 镜头信息完整（动作摘要、镜头运动、景别等）

### 2. 导出 EDL/XML 文件

1. **进入成片与导出页签**
   - 在 BigBanana 中完成视频生成
   - 点击侧边栏的"成片与导出"页签

2. **选择导出格式**
   - 找到 "Export EDL / XML" 按钮
   - 点击按钮，显示下拉菜单
   - 选择导出格式：
     - **Export EDL** - 适用于 Premiere Pro、DaVinci Resolve
     - **Export FCPXML** - 适用于 Final Cut Pro、DaVinci Resolve

3. **下载导出文件**
   - 系统自动下载对应的文件
   - 文件名格式：`{项目标题}_{时间戳}.edl` 或 `{项目标题}_{时间戳}.fcpxml`
   - 保存到本地

### 3. 下载视频素材

EDL/XML 文件只包含剪辑信息，不包含视频文件本身。你需要：

1. **下载所有视频片段**
   - 点击 "Download ZIP" 按钮
   - 下载包含所有视频片段的 ZIP 文件
   - 解压 ZIP 文件

2. **整理文件结构**
   - 创建项目文件夹
   - 将视频文件放在 `shots/` 子文件夹中
   - 确保 EDL/XML 文件和视频文件在同一目录

### 4. 导入到剪辑软件

#### Adobe Premiere Pro

**导入 EDL**:
1. 打开 Premiere Pro
2. 选择 `File` → `Import` (Ctrl/Cmd + I)
3. 选择 EDL 文件
4. 在弹出的对话框中，选择视频文件的帧率（通常 30fps）
5. Premiere Pro 会创建一个包含所有镜头的序列

**导入 FCPXML**:
1. 打开 Premiere Pro
2. 选择 `File` → `Import` (Ctrl/Cmd + I)
3. 选择 FCPXML 文件
4. Premiere Pro 会创建一个包含所有镜头的序列

**重新链接素材**:
1. 在项目面板中，右键点击序列
2. 选择 `Link Media`
3. 浏览到视频文件所在的文件夹
4. 选择对应的视频文件
5. Premiere Pro 会自动匹配文件名

#### DaVinci Resolve

**导入 EDL**:
1. 打开 DaVinci Resolve
2. 创建新项目
3. 在 `Media` 页面，右键点击空白区域
4. 选择 `Import EDL/XML`
5. 选择 EDL 文件
6. DaVinci Resolve 会创建一个时间线

**导入 FCPXML**:
1. 打开 DaVinci Resolve
2. 创建新项目
3. 在 `Media` 页面，右键点击空白区域
4. 选择 `Import EDL/XML`
5. 选择 FCPXML 文件
6. DaVinci Resolve 会创建一个时间线

**重新链接素材**:
1. 在 `Media` 页面，导入所有视频文件
2. 在 `Edit` 页面，右键点击时间线上的片段
3. 选择 `Link Media`
4. 选择对应的视频文件
5. DaVinci Resolve 会自动匹配文件名

#### Final Cut Pro

**导入 FCPXML**:
1. 打开 Final Cut Pro
2. 选择 `File` → `Import` → `XML`
3. 选择 FCPXML 文件
4. Final Cut Pro 会创建一个包含所有镜头的项目

**重新链接素材**:
1. Final Cut Pro 会自动尝试链接素材
2. 如果链接失败，会提示选择文件位置
3. 浏览到视频文件所在的文件夹
4. 选择对应的视频文件

---

## EDL/XML 文件内容

### EDL 文件示例

```
TITLE: My Project
FCM: NON-DROP FRAME

001  001  V     C        00:00:00:00 00:00:04:00 00:00:00:00 00:00:04:00
* FROM CLIP NAME: Shot_001.mp4
* COMMENT: Alex walks into the spaceship command center
* CAMERA: DOLLY
* SHOT SIZE: MED

002  002  V     C        00:00:00:00 00:00:05:00 00:00:04:00 00:00:09:00
* FROM CLIP NAME: Shot_002.mp4
* COMMENT: Sarah looks at the holographic display
* CAMERA: PAN
* SHOT SIZE: CU
* DIALOGUE: "Welcome aboard."
```

**字段说明**:
- `TITLE`: 项目标题
- `FCM`: 帧码模式（NON-DROP FRAME = 非丢帧模式）
- `001  001  V     C`: 编辑编号、事件编号、轨道类型、转场类型
- `00:00:00:00 00:00:04:00`: 源素材入点和出点
- `00:00:00:00 00:00:04:00`: 录制机入点和出点
- `* FROM CLIP NAME`: 视频文件名
- `* COMMENT`: 镜头动作摘要
- `* CAMERA`: 镜头运动类型
- `* SHOT SIZE`: 镜头景别
- `* DIALOGUE`: 对话内容

### FCPXML 文件示例

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="FFVideoFormat1920x1080" 
            frameDuration="1001/30000s" 
            width="1920" height="1080"/>
    <asset id="r2" name="Shot_001.mp4" 
           src="file://./shots/Shot_001.mp4" 
           duration="4s" 
           hasVideo="1" hasAudio="0"/>
    <asset id="r3" name="Shot_002.mp4" 
           src="file://./shots/Shot_002.mp4" 
           duration="5s" 
           hasVideo="1" hasAudio="0"/>
  </resources>
  <library>
    <event name="My Project">
      <project name="My Project">
        <sequence format="r1" duration="9s">
          <spine>
            <clip offset="0s" duration="4s" ref="r2">
              <name>Shot 1: Alex walks into the spaceship command center</name>
              <note>DOLLY</note>
              <metadata>
                <md key="com.apple.finalcutpro.shot.size" 
                     value="MED"/>
              </metadata>
            </clip>
            <clip offset="4s" duration="5s" ref="r3">
              <name>Shot 2: Sarah looks at the holographic display</name>
              <note>PAN</note>
              <metadata>
                <md key="com.apple.finalcutpro.dialogue" 
                     value="Welcome aboard."/>
              </metadata>
            </clip>
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
```

**字段说明**:
- `format`: 视频格式（分辨率、帧率）
- `asset`: 视频素材（文件名、路径、时长）
- `sequence`: 序列（时间线）
- `clip`: 片段（镜头）
- `offset`: 片段在时间线上的起始位置
- `duration`: 片段时长
- `name`: 片段名称
- `note`: 备注（镜头运动）
- `metadata`: 元数据（景别、对话等）

---

## 常见问题

### Q: 导出 EDL/XML 后，在剪辑软件中无法播放视频？

**A**: 这是正常现象。EDL/XML 文件只包含剪辑信息，不包含视频文件本身。你需要：

1. 下载所有视频片段（使用 "Download ZIP" 功能）
2. 解压 ZIP 文件
3. 将视频文件放在正确的路径
4. 在剪辑软件中重新链接素材

### Q: 如何选择导出格式？

**A**: 根据你使用的剪辑软件选择：

- **Premiere Pro**: 推荐 EDL，也可以使用 FCPXML
- **DaVinci Resolve**: 推荐 FCPXML，也可以使用 EDL
- **Final Cut Pro**: 必须使用 FCPXML
- **Avid Media Composer**: 推荐 EDL

### Q: 导出的文件名是什么格式？

**A**: 文件名格式为 `{项目标题}_{时间戳}.edl` 或 `{项目标题}_{时间戳}.fcpxml`

- 时间戳格式：`YYYY-MM-DDTHH-MM-SS`
- 示例：`My_Project_2026-03-11T12-30-45.edl`

### Q: EDL 和 FCPXML 有什么区别？

**A**: 主要区别：

| 特性 | EDL | FCPXML |
|------|------|---------|
| 格式类型 | 纯文本 | XML |
| 文件大小 | 极小 | 较大 |
| 元数据 | 有限 | 丰富 |
| 兼容性 | 广泛 | Final Cut Pro 最佳 |
| 复杂度 | 简单 | 复杂 |

**建议**:
- 使用 Final Cut Pro → 选择 FCPXML
- 使用 DaVinci Resolve → 选择 FCPXML
- 使用 Premiere Pro → 选择 EDL 或 FCPXML
- 使用其他软件 → 选择 EDL

### Q: 为什么视频文件路径是相对路径？

**A**: EDL/XML 文件中的路径是相对路径，方便在不同设备间移动项目。

- EDL: `* FROM CLIP NAME: Shot_001.mp4`
- FCPXML: `src="file://./shots/Shot_001.mp4"`

**使用时**:
1. 将视频文件放在 `shots/` 子文件夹中
2. 确保 EDL/XML 文件和 `shots/` 文件夹在同一目录
3. 在剪辑软件中重新链接素材

### Q: 时间码不准确怎么办？

**A**: 当前版本的时间码基于镜头时长计算，可能不够精确。

**临时解决方案**:
1. 在剪辑软件中手动调整时间码
2. 使用剪辑软件的自动匹配功能

**未来改进**:
- 添加时间码偏移量配置
- 支持自定义起始时间码
- 支持不同的帧率

### Q: 导出失败怎么办？

**A**: 可能的原因和解决方法：

1. **没有可导出的镜头**
   - 确保至少有一个镜头的视频已生成完成
   - 检查镜头状态是否为 "completed"

2. **项目数据损坏**
   - 刷新页面
   - 重新加载项目
   - 联系技术支持

3. **浏览器不支持**
   - 使用现代浏览器（Chrome、Firefox、Edge、Safari）
   - 更新浏览器到最新版本

---

## 高级技巧

### 1. 批量导出

如果你需要同时导出 EDL 和 FCPXML：

1. 先导出 EDL
2. 再导出 FCPXML
3. 将两个文件保存在同一目录
4. 根据需要选择使用哪个格式

### 2. 自定义文件名

如果你想自定义文件名：

1. 导出 EDL/XML 文件
2. 重命名文件（保持扩展名不变）
3. 在剪辑软件中导入

### 3. 编辑 EDL/XML 文件

如果你想手动修改 EDL/XML 文件：

1. 使用文本编辑器打开文件
2. 修改需要的内容
3. 保存文件
4. 在剪辑软件中导入

**注意**:
- 确保格式正确
- 不要修改时间码格式
- 修改后备份原文件

### 4. 验证 EDL/XML 文件

如果你想验证 EDL/XML 文件是否正确：

1. 使用文本编辑器打开文件
2. 检查格式是否符合标准
3. 在剪辑软件中尝试导入
4. 如果导入失败，检查错误信息

---

## 最佳实践

### 1. 文件组织

建议的文件结构：

```
My_Project/
├── My_Project_2026-03-11T12-30-45.edl
├── My_Project_2026-03-11T12-30-45.fcpxml
└── shots/
    ├── Shot_001.mp4
    ├── Shot_002.mp4
    ├── Shot_003.mp4
    └── ...
```

### 2. 备份重要文件

在导入到剪辑软件之前：

1. 备份 EDL/XML 文件
2. 备份所有视频文件
3. 保存项目设置

### 3. 版本控制

如果你需要多个版本：

1. 每次导出使用不同的文件名
2. 添加版本号或日期
3. 保留历史版本

### 4. 团队协作

如果多人协作：

1. 统一使用相同的文件结构
2. 统一使用相同的导出格式
3. 使用版本控制系统（如 Git）
4. 定期同步文件

---

## 技术支持

如遇到问题，请：

1. 查看浏览器控制台日志
2. 检查文件格式是否正确
3. 尝试重新导出
4. 查看剪辑软件的导入文档
5. 联系技术支持

---

## 后续计划

未来可以考虑添加：

- 导出配置面板（帧率、分辨率、起始时间码）
- 支持更多格式（AAF、ALE）
- 批量导出功能
- 导出预览功能
- 自动匹配视频文件
- 云端同步功能
- 双向同步（从剪辑软件导入到 BigBanana）
