/**
 * 时代背景知识库
 * 为 Art Direction 提供准确的史实参考，确保角色服装/装备符合历史标准
 */

export interface EraContext {
  era: string;
  period: string;
  description: string;
  uniformDetails: string[];
  equipmentNotes: string[];
  visualReferences: string[];
}

const ERA_DB: EraContext[] = [
  {
    era: '抗日战争',
    period: '1937-1945',
    description: '中国抗日战争时期（Second Sino-Japanese War），包含八路军、新四军、国民革命军与侵华日军各方势力',
    uniformDetails: [
      '八路军（第十八集团军）：深灰绿/土黄色粗布军服，立领，布条纽扣，臂章"18GA"或"八路"，绑腿，布鞋或草鞋，无正式衔级标识',
      '国民革命军（国军）：黄绿色卡其布军服，德式/美式剪裁，大檐帽或德式M35钢盔，皮腰带，皮靴或胶鞋，领章军衔',
      '日军（侵华日军）：昭五式（后期九八式/三式）军服，土黄色或深绿色，立领，肩章（后期改为领章），皮靴，皮带，将校军官佩军刀',
      '日军特工队/伞兵：深绿色或黑色制服（如亮剑中山本特工队），轻量化装备，配备消音武器和短冲锋枪',
    ],
    equipmentNotes: [
      '八路军主力装备：中正式步枪、汉阳造、缴获的三八式步枪，少量轻机枪（捷克式/ZB26），手榴弹是主要火力',
      '日军标准装备：三八式步枪（"三八大盖"）、王八盒子（南部十四式手枪）、九二式重机枪、掷弹筒',
      '国军装备：德械师装备中正式步枪、M24手榴弹、MG34机枪（少量），后期美械装备',
      '亮剑中著名的"意大利炮"实际为法国M1897 75mm野战炮（"法国小姐"），经意大利改造后流入中国战场',
    ],
    visualReferences: [
      '八路军服装以灰/土黄/深绿色为主色调，布料粗糙、磨损明显，体现物资匮乏',
      '日军服装颜色更统一、染料质量更好，军官服与士兵服有明显质感差异',
      '冬季场景：八路军穿棉袄、裹头巾，日军穿呢子大衣',
      '所有军服应呈现泥泞、汗渍、磨损的战争痕迹，避免"阅兵式"般的整洁',
    ],
  },
  {
    era: '解放战争',
    period: '1945-1949',
    description: '国共内战时期',
    uniformDetails: [
      '解放军：草绿色或土黄色军服，解放帽（软帽檐），布质红五星帽徽，布腰带，绑腿',
      '国民党军：美式装备为主，黄绿色卡其布军服，美式M1钢盔，皮靴',
    ],
    equipmentNotes: [
      '解放军大量使用缴获的日式和美式装备',
      '国民党军以美械为主，火力占优',
    ],
    visualReferences: [
      '与抗日时期相比，解放军军服颜色更偏草绿',
      '装备更加杂驳，缴获物资混用是时代特征',
    ],
  },
  {
    era: '古代中国',
    period: '古代',
    description: '中国古代历史题材（含武侠/历史剧）',
    uniformDetails: [
      '汉代：交领右衽深衣/曲裾，官员佩绶带，士兵着札甲/皮甲',
      '唐代：圆领袍衫，幞头，铠甲为明光甲/山文甲',
      '宋代：圆领公服，展脚幞头，士兵着步人甲/纸甲',
      '明代：补服，乌纱帽，飞鱼服（赐服），士兵着布面甲/棉甲',
      '清代：马褂+长衫，顶戴花翎，士兵着号衣+金属泡钉甲',
    ],
    equipmentNotes: [
      '冷兵器为主：刀、枪、剑、戟、弓弩',
      '火器出现在宋元以后（火铳、鸟枪、红衣大炮）',
      '铠甲材质和形制随朝代演变明显',
    ],
    visualReferences: [
      '古装剧应参考对应朝代的壁画、画像和考古复原',
      '服装配色需符合历史等级制度（如明黄色为皇室专用）',
    ],
  },
  {
    era: '现代/都市',
    period: '当代',
    description: '现代都市背景',
    uniformDetails: [
      '现代军警制服按对应国家/部门标准设计',
      '日常便服符合当代时尚潮流且切合角色身份',
      '特殊职业（医生、律师、工人等）需表现职业特征',
    ],
    equipmentNotes: [
      '现代装备和电子设备应符合剧情年代',
      '注意年代感：2000年与2020年的手机/汽车有明显差异',
    ],
    visualReferences: [
      '现代题材注重品牌和质感的真实感',
      '年代剧需做旧处理，避免"全新感"',
    ],
  },
  {
    era: '奇幻/科幻',
    period: '架空',
    description: '架空世界观（奇幻、科幻、仙侠等）',
    uniformDetails: [
      '服装设计需基于世界观设定保持内在一致性',
      '不同阵营/种族应有清晰的视觉区隔',
      '功能性设计需符合设定（如科幻护甲、魔法袍）',
    ],
    equipmentNotes: [
      '武器/道具设计需符合世界观的技术水平',
      '保持视觉风格的统一性',
    ],
    visualReferences: [
      '建议参考同类作品建立视觉锚点',
      '仙侠可参考唐宋服饰基底+飘带/甲片等风格化元素',
    ],
  },
];

function detectEraFromInput(
  genre: string,
  title: string,
  characters: { name: string; gender: string; age: string; personality: string }[]
): EraContext {
  const combined = `${genre} ${title}`.toLowerCase();

  const hasJapaneseNames = characters.some(c =>
    /山本|武田|织田|铃木|佐藤|田中|松下|井上|吉田|松井|渡边/i.test(c.name)
  );

  if (
    /抗日|日本|日军|鬼子|侵华|1937|1945|亮剑|平安县城|八路军|新四军|国民革命军|晋绥军/i.test(combined) ||
    hasJapaneseNames
  ) {
    const era = ERA_DB.find(e => e.era === '抗日战争')!;
    return {
      ...era,
      uniformDetails: [
        ...era.uniformDetails,
        ...(hasJapaneseNames
          ? ['当前剧本含日军角色：日军军官服以昭五式为主，将校佩军刀；士兵着土黄色呢子军服，三八式步枪为标配']
          : []),
      ],
    };
  }

  if (/解放战争|内战|1945|1949|国共/i.test(combined)) {
    return ERA_DB.find(e => e.era === '解放战争')!;
  }

  if (/古代|古装|武侠|历史|唐朝|宋朝|明朝|清朝|秦汉|三国|战国/i.test(combined)) {
    return ERA_DB.find(e => e.era === '古代中国')!;
  }

  if (/奇幻|科幻|仙侠|魔法|异能|未来/i.test(combined)) {
    return ERA_DB.find(e => e.era === '奇幻/科幻')!;
  }

  return ERA_DB.find(e => e.era === '现代/都市')!;
}

export function buildEraContextBlock(
  title: string,
  genre: string,
  characters: { name: string; gender: string; age: string; personality: string }[],
  language: string
): string {
  const context = detectEraFromInput(genre, title, characters);

  const lines: string[] = [];
  lines.push('');
  lines.push(`## HISTORICAL/ERA CONTEXT (MANDATORY - ${context.era} ${context.period})`);
  lines.push(`当设计角色服装、装备和场景时，必须基于以下史实参考：`);
  lines.push('');

  lines.push(`### 时代背景`);
  lines.push(context.description);
  lines.push('');

  lines.push(`### 军服/制服标准`);
  context.uniformDetails.forEach(d => lines.push(`- ${d}`));
  lines.push('');

  lines.push(`### 装备特征`);
  context.equipmentNotes.forEach(d => lines.push(`- ${d}`));
  lines.push('');

  lines.push(`### 视觉注意事项`);
  context.visualReferences.forEach(d => lines.push(`- ${d}`));
  lines.push('');

  lines.push('必须将这些史实知识融入 colorPalette、characterDesignRules、consistencyAnchors 中，确保所有角色服装和装备符合对应的历史时期标准。');
  lines.push('');

  return language === '中文' ? lines.join('\n') : lines.join('\n');
}
