/**
 * 提示词常量
 * 统一管理所有视觉风格相关的提示词映射，消除各函数中的重复定义
 */

// ============================================
// 英文视觉风格提示词（用于 AI 图像生成 prompt）
// ============================================

export const VISUAL_STYLE_PROMPTS: { [key: string]: string } = {
  'live-action': 'photorealistic, cinematic film quality, real human actors, professional cinematography, natural lighting, 8K resolution, shallow depth of field, film grain texture, color graded, anamorphic lens flare, three-point lighting setup',
  'anime': 'Japanese anime style, cel-shaded, vibrant saturated colors, large expressive eyes with detailed iris highlights, dynamic action poses, clean sharp outlines, consistent line weight throughout, Studio Ghibli/Makoto Shinkai quality, painted sky backgrounds, soft ambient lighting with dramatic rim light',
  '2d-animation': 'classic 2D animation, hand-drawn style, Disney/Pixar quality, smooth clean lines with consistent weight, expressive characters with squash-and-stretch principles, painterly watercolor backgrounds, soft gradient shading, warm color palette, round friendly character proportions',
  '3d-animation': 'high-quality 3D CGI animation, Pixar/DreamWorks style, subsurface scattering on skin, detailed PBR textures, stylized character proportions, volumetric lighting, ambient occlusion, soft shadows, physically-based rendering, motion blur',
  'cyberpunk': 'cyberpunk aesthetic, neon-lit urban environment, rain-soaked reflective streets, holographic UI displays, high-tech low-life contrast, Blade Runner style, volumetric fog with neon color bleeding, chromatic aberration, cool blue-purple palette with hot pink and cyan accents, gritty detailed textures',
  'oil-painting': 'oil painting style, visible impasto brushstrokes, rich layered textures, classical art composition with golden ratio, museum quality fine art, warm undertones, Rembrandt lighting, chiaroscuro contrast, canvas texture visible, glazing technique color depth',
  'ink-wash': 'traditional Chinese ink wash painting style (水墨画), brush and ink on xuan paper texture, flowing ink gradients, deliberate brushstrokes with varying ink density, negative space and minimalist composition, misty atmospheric perspective, classical Chinese landscape painting tradition, elegant restraint, poetic visual language, natural color palette of ink black, grays, and subtle traditional pigments (cyan, ochre, vermillion accents)',
};

// ============================================
// 中文视觉风格描述（用于中文 prompt 和 UI 显示）
// ============================================

export const VISUAL_STYLE_PROMPTS_CN: { [key: string]: string } = {
  'live-action': '真人实拍电影风格，photorealistic，8K高清，专业摄影',
  'anime': '日本动漫风格，cel-shaded，鲜艳色彩，Studio Ghibli品质',
  '2d-animation': '经典2D动画风格，手绘风格，Disney/Pixar品质',
  '3d-animation': '3D CGI动画，Pixar/DreamWorks风格，精细材质',
  'cyberpunk': '赛博朋克美学，霓虹灯光，未来科技感',
  'oil-painting': '油画风格，可见笔触，古典艺术构图',
  'ink-wash': '水墨国风，传统中国水墨画，毛笔宣纸质感，浓淡干湿墨韵变化，留白与写意构图，淡雅配色',
};

// ============================================
// 角色负面提示词（排除不想要的视觉元素）
// ============================================

export const NEGATIVE_PROMPTS: { [key: string]: string } = {
  'live-action': 'cartoon, anime, illustration, painting, drawing, 3d render, cgi, low quality, blurry, grainy, watermark, text, logo, signature, distorted face, bad anatomy, extra limbs, mutated hands, deformed, ugly, disfigured, poorly drawn, amateur',
  'anime': 'photorealistic, 3d render, western cartoon, ugly, bad anatomy, extra limbs, deformed limbs, blurry, watermark, text, logo, poorly drawn face, mutated hands, extra fingers, missing fingers, bad proportions, grotesque',
  '2d-animation': 'photorealistic, 3d, low quality, pixelated, blurry, watermark, text, bad anatomy, deformed, ugly, amateur drawing, inconsistent style, rough sketch',
  '3d-animation': 'photorealistic, 2d, flat, hand-drawn, low poly, bad topology, texture artifacts, z-fighting, clipping, low quality, blurry, watermark, text, bad rigging, unnatural movement',
  'cyberpunk': 'bright daylight, pastoral, medieval, fantasy, cartoon, low tech, rural, natural, watermark, text, logo, low quality, blurry, amateur',
  'oil-painting': 'digital art, photorealistic, 3d render, cartoon, anime, low quality, blurry, watermark, text, amateur, poorly painted, muddy colors, overworked canvas',
  'ink-wash': 'oil painting, impasto, thick paint, photorealistic, 3d render, anime, cartoon, western art style, bright neon colors, oversaturated, heavy digital effects, graffiti, pop art, low quality, blurry, watermark, text',
};

// ============================================
// 场景专用负面提示词（额外排除人物/人形元素）
// ============================================

export const SCENE_NEGATIVE_PROMPTS: { [key: string]: string } = {
  'live-action': 'person, people, human, man, woman, child, figure, silhouette, crowd, pedestrian, portrait, face, body, hands, feet, ' + NEGATIVE_PROMPTS['live-action'],
  'anime': 'person, people, human, character, figure, silhouette, crowd, portrait, face, body, hands, ' + NEGATIVE_PROMPTS['anime'],
  '2d-animation': 'person, people, human, character, figure, silhouette, crowd, portrait, face, body, ' + NEGATIVE_PROMPTS['2d-animation'],
  '3d-animation': 'person, people, human, character, figure, silhouette, crowd, portrait, face, body, ' + NEGATIVE_PROMPTS['3d-animation'],
  'cyberpunk': 'person, people, human, figure, silhouette, crowd, pedestrian, portrait, face, body, ' + NEGATIVE_PROMPTS['cyberpunk'],
  'oil-painting': 'person, people, human, figure, silhouette, crowd, portrait, face, body, ' + NEGATIVE_PROMPTS['oil-painting'],
  'ink-wash': 'person, people, human, figure, silhouette, crowd, portrait, face, body, ' + NEGATIVE_PROMPTS['ink-wash'],
};

// ============================================
// 通用质量增强标签（文生图默认追加）
// ============================================

export const DEFAULT_QUALITY_TAGS = 'cinematic, highly detailed, 8K resolution, professional lighting, sharp focus, film grain texture';

export const getDefaultQualityTags = (): string => DEFAULT_QUALITY_TAGS;

/**
 * 为文生图 prompt 自动追加质量标签（如果尚未包含）
 */
export const enhanceWithQualityTags = (prompt: string): string => {
  const hasQualityTerms = /cinematic|8K|photorealistic|highly detailed|professional|sharp focus|film grain/i.test(prompt);
  if (hasQualityTerms) {
    return prompt;
  }
  return `${prompt}, ${DEFAULT_QUALITY_TAGS}`;
};

/**
 * 获取视觉风格的英文提示词，如果风格不在预设中则原样返回
 */
export const getStylePrompt = (visualStyle: string): string => {
  return VISUAL_STYLE_PROMPTS[visualStyle] || visualStyle;
};

/**
 * 获取视觉风格的中文描述，如果风格不在预设中则原样返回
 */
export const getStylePromptCN = (visualStyle: string): string => {
  return VISUAL_STYLE_PROMPTS_CN[visualStyle] || visualStyle;
};

/**
 * 获取角色负面提示词
 */
export const getNegativePrompt = (visualStyle: string): string => {
  return NEGATIVE_PROMPTS[visualStyle] || NEGATIVE_PROMPTS['live-action'];
};

/**
 * 获取场景负面提示词
 */
export const getSceneNegativePrompt = (visualStyle: string): string => {
  return SCENE_NEGATIVE_PROMPTS[visualStyle] || SCENE_NEGATIVE_PROMPTS['live-action'];
};
