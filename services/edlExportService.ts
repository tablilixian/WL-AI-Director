import { ProjectState } from '../types';

/**
 * EDL (Edit Decision List) 导出服务
 * 用于将项目导出为 EDL 格式，可在 Premiere Pro、DaVinci Resolve 等专业剪辑软件中使用
 */

/**
 * 时间码格式化
 * 将秒数转换为 EDL 标准时间码格式 (HH:MM:SS:FF)
 * @param seconds 秒数
 * @param frameRate 帧率，默认 30fps
 * @returns 时间码字符串，格式为 HH:MM:SS:FF
 */
function formatTimecode(seconds: number, frameRate: number = 30): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const frames = Math.floor((seconds % 1) * frameRate);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
}

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
 * 生成 EDL 文件内容
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 * @returns EDL 文件内容字符串
 */
export function generateEDL(project: ProjectState, frameRate: number = 30): string {
  const shots = project.shots;
  const title = project.scriptData?.title || project.title || 'Untitled';

  let edl = `TITLE: ${title}\n`;
  edl += `FCM: NON-DROP FRAME\n\n`;

  let currentTime = 0;

  shots.forEach((shot, index) => {
    const duration = shot.interval?.duration || 4;
    const endTime = currentTime + duration;
    const shotNumber = String(index + 1).padStart(3, '0');

    edl += `${shotNumber}  ${shotNumber}  V     C        `;
    edl += `00:00:00:00 ${formatTimecode(duration, frameRate)}  `;
    edl += `${formatTimecode(currentTime, frameRate)} ${formatTimecode(endTime, frameRate)}\n`;

    edl += `* FROM CLIP NAME: Shot_${shotNumber}.mp4\n`;
    edl += `* COMMENT: ${sanitizeFileName(shot.actionSummary)}\n`;

    if (shot.cameraMovement) {
      edl += `* CAMERA: ${shot.cameraMovement}\n`;
    }

    if (shot.shotSize) {
      edl += `* SHOT SIZE: ${shot.shotSize}\n`;
    }

    if (shot.dialogue) {
      edl += `* DIALOGUE: ${shot.dialogue}\n`;
    }

    edl += '\n';
    currentTime = endTime;
  });

  return edl;
}

/**
 * 下载 EDL 文件
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 */
export function downloadEDL(project: ProjectState, frameRate: number = 30): void {
  const edl = generateEDL(project, frameRate);
  const title = project.scriptData?.title || project.title || 'untitled';
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
  const fileName = `${title}_${timestamp}.edl`;

  const blob = new Blob([edl], { type: 'text/plain' });
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
 * 获取 EDL 文件预览
 * @param project 项目数据
 * @param frameRate 帧率，默认 30fps
 * @returns EDL 文件内容
 */
export function getEDLPreview(project: ProjectState, frameRate: number = 30): string {
  return generateEDL(project, frameRate);
}
