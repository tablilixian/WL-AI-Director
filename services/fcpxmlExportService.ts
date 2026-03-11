import { ProjectState } from '../types';

/**
 * FCPXML 导出服务
 * 用于将项目导出为 FCPXML 格式，可在 Final Cut Pro、DaVinci Resolve 等专业剪辑软件中使用
 */

/**
 * 清理文件名
 * 移除文件名中的非法字符
 * @param name 原始文件名
 * @returns 清理后的文件名
 */
function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\?%*:|"<>]/g, '_').substring(0, 50);
}

/**
 * 清理 XML 文本
 * 转义 XML 特殊字符
 * @param text 原始文本
 * @returns 转义后的文本
 */
function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * 计算项目总时长（秒）
 * @param project 项目数据
 * @returns 总时长（秒）
 */
function calculateTotalDuration(project: ProjectState): number {
  return project.shots.reduce((acc, shot) => {
    return acc + (shot.interval?.duration || 4);
  }, 0);
}

/**
 * 格式化时长为 FCPXML 格式
 * @param seconds 秒数
 * @returns 时长字符串，格式为 "3600s" 或 "1001/30000s"
 */
function formatDuration(seconds: number): string {
  return `${Math.round(seconds * 10000) / 10000}s`;
}

/**
 * 生成 FCPXML 文件内容
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 * @param width 视频宽度，默认 1920
 * @param height 视频高度，默认 1080
 * @returns FCPXML 文件内容字符串
 */
export function generateFCPXML(
  project: ProjectState,
  frameRate: number = 30,
  width: number = 1920,
  height: number = 1080
): string {
  const shots = project.shots;
  const title = project.scriptData?.title || project.title || 'Untitled';
  const totalDuration = calculateTotalDuration(project);

  const frameDuration = frameRate === 30 ? '1001/30000s' : '1000/24000s';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<!DOCTYPE fcpxml>\n`;
  xml += `<fcpxml version="1.10">\n`;
  xml += `  <resources>\n`;
  xml += `    <format id="r1" name="FFVideoFormat${width}x${height}" \n`;
  xml += `            frameDuration="${frameDuration}" \n`;
  xml += `            width="${width}" height="${height}"/>\n`;

  shots.forEach((shot, index) => {
    const shotNumber = String(index + 1).padStart(3, '0');
    const duration = shot.interval?.duration || 4;
    const fileName = `Shot_${shotNumber}.mp4`;

    xml += `    <asset id="r${index + 2}" \n`;
    xml += `           name="${escapeXML(fileName)}" \n`;
    xml += `           src="file://./shots/${fileName}" \n`;
    xml += `           duration="${formatDuration(duration)}" \n`;
    xml += `           hasVideo="1" hasAudio="0"/>\n`;
  });

  xml += `  </resources>\n`;
  xml += `  <library>\n`;
  xml += `    <event name="${escapeXML(title)}">\n`;
  xml += `      <project name="${escapeXML(title)}">\n`;
  xml += `        <sequence format="r1" duration="${formatDuration(totalDuration)}">\n`;
  xml += `          <spine>\n`;

  let currentTime = 0;

  shots.forEach((shot, index) => {
    const duration = shot.interval?.duration || 4;
    const shotNumber = String(index + 1).padStart(3, '0');
    const fileName = `Shot_${shotNumber}.mp4`;

    xml += `            <clip offset="${formatDuration(currentTime)}" \n`;
    xml += `                  duration="${formatDuration(duration)}" \n`;
    xml += `                  ref="r${index + 2}">\n`;
    xml += `              <name>Shot ${index + 1}: ${escapeXML(shot.actionSummary)}</name>\n`;

    if (shot.cameraMovement) {
      xml += `              <note>${escapeXML(shot.cameraMovement)}</note>\n`;
    }

    if (shot.shotSize) {
      xml += `              <metadata>\n`;
      xml += `                <md key="com.apple.finalcutpro.shot.size" \n`;
      xml += `                     value="${escapeXML(shot.shotSize)}"/>\n`;
      xml += `              </metadata>\n`;
    }

    if (shot.dialogue) {
      xml += `              <metadata>\n`;
      xml += `                <md key="com.apple.finalcutpro.dialogue" \n`;
      xml += `                     value="${escapeXML(shot.dialogue)}"/>\n`;
      xml += `              </metadata>\n`;
    }

    xml += `            </clip>\n`;

    currentTime += duration;
  });

  xml += `          </spine>\n`;
  xml += `        </sequence>\n`;
  xml += `      </project>\n`;
  xml += `    </event>\n`;
  xml += `  </library>\n`;
  xml += `</fcpxml>`;

  return xml;
}

/**
 * 下载 FCPXML 文件
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 * @param width 视频宽度，默认 1920
 * @param height 视频高度，默认 1080
 */
export function downloadFCPXML(
  project: ProjectState,
  frameRate: number = 30,
  width: number = 1920,
  height: number = 1080
): void {
  const fcpxml = generateFCPXML(project, frameRate, width, height);
  const title = project.scriptData?.title || project.title || 'untitled';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `${title}_${timestamp}.fcpxml`;

  const blob = new Blob([fcpxml], { type: 'application/xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 获取 FCPXML 文件预览
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 * @param width 视频宽度，默认 1920
 * @param height 视频高度，默认 1080
 * @returns FCPXML 文件内容
 */
export function getFCPXMLPreview(
  project: ProjectState,
  frameRate: number = 30,
  width: number = 1920,
  height: number = 1080
): string {
  return generateFCPXML(project, frameRate, width, height);
}
