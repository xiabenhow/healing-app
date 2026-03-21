export interface OilLibraryItem {
  name: string;
  en: string;
  family: string;
  part: string;
  use: string;
  physical: string;
  mental: string;
  emoji: string;
  tags: string[];
}

export const OIL_LIBRARY: OilLibraryItem[] = [
  {
    name: '甜橙', en: 'Orange', family: '芸香科', part: '果皮',
    use: '嬰幼兒脹氣、消化不良、食慾不振\n幫助腸胃蠕動、治便祕',
    physical: '分子最小，輕盈易揮發（前調）\n促循環、行氣效果好\n代謝快、安全性高\n抗菌、抗病毒\n抗發炎、消炎\n助消化\n提升免疫',
    mental: '提高專注力\n緩解緊張情緒\n心靈溫暖\n支持與陪伴',
    emoji: '🍊', tags: ['提振心情', '消化', '兒童可用', '前調']
  },
  {
    name: '檸檬', en: 'Lemon', family: '芸香科', part: '果皮',
    use: '改善情志鬱悶、退燒、感冒\n提升注意力、肌膚控油',
    physical: '抗菌、促循環\n淨化空氣\n具光敏性',
    mental: '淨化心情\n帶來清新正向感\n提升專注力',
    emoji: '🍋', tags: ['提振心情', '淨化', '前調', '光敏性']
  },
  {
    name: '歐洲赤松', en: 'Scotch Pine', family: '松科', part: '針葉',
    use: '頻尿、漏尿、夜尿\n助行氣、激勵內分泌',
    physical: '提振精神\n淨化呼吸道\n增強體力\n促進循環',
    mental: '注入活力與動力\n化解疲憊與無力感',
    emoji: '🌲', tags: ['活力', '呼吸道', '前中調']
  },
  {
    name: '絲柏', en: 'Cypress', family: '柏科', part: '針葉',
    use: '利尿、泌尿系統發炎\n緩解落髮、抗痙攣\n孕婦溫和促循環（孕婦可用）',
    physical: '促進循環\n收斂\n淨化呼吸道',
    mental: '穩定情緒波動\n給予安定感與方向感',
    emoji: '🌿', tags: ['穩定情緒', '循環', '中後調']
  },
  {
    name: '索馬利亞乳香', en: 'Frankincense', family: '橄欖科', part: '樹脂',
    use: '改善血瘀手麻、腕隧道症候群\n活血化瘀、促進傷口癒合（孕婦不可使用）',
    physical: '修護肌膚\n抗發炎\n強化免疫',
    mental: '深層放鬆\n幫助冥想\n連結內在平靜',
    emoji: '🪨', tags: ['深層療癒', '冥想', '後調']
  },
  {
    name: '岩玫瑰', en: 'Cistus', family: '半日花科', part: '葉片',
    use: '改善子宮肌瘤導致經血過量\n強大癒合能力\n活血化瘀（孕婦可用）',
    physical: '促進傷口癒合\n強大止血效果',
    mental: '接地\n面對內心恐懼',
    emoji: '🌺', tags: ['癒合', '婦科', '後調']
  },
  {
    name: '德國洋甘菊', en: 'German Chamomile', family: '菊科', part: '開花全株',
    use: '異位性皮膚炎\n呼吸道過敏\n清肝瀉火',
    physical: '促循環（抗發炎、抗組織胺）\n抗菌、抗病毒\n緩解過敏、止癢\n鎮靜、略可降低血壓',
    mental: '自我反省\n面對的勇氣\n與敵人和解\n為自己發聲',
    emoji: '🌼', tags: ['抗發炎', '過敏', '情緒療癒', '中後調']
  },
  {
    name: '依蘭', en: 'Ylang Ylang', family: '番荔枝科', part: '花朵',
    use: '平衡皮脂分泌\n平衡賀爾蒙\n婦科問題、安撫情緒',
    physical: '平衡油脂分泌\n調節血壓',
    mental: '釋放壓力\n喚醒感官\n提升自信\n給予溫暖安心',
    emoji: '🌸', tags: ['感性', '賀爾蒙', '後調']
  },
  {
    name: '薑', en: 'Ginger', family: '薑科', part: '根部',
    use: '溫肺止咳（寒咳）\n促進循環、改善胃寒（陰虛火旺禁用）',
    physical: '暖身\n助消化\n促循環',
    mental: '提振精神\n增強行動力',
    emoji: '🫚', tags: ['暖身', '消化', '中後調']
  },
  {
    name: '綠花白千層', en: 'Niaouli', family: '桃金孃科', part: '葉片',
    use: '改善攝護腺炎\n增強免疫力、抗病毒抗菌\n改善曬傷皮膚紅腫',
    physical: '化痰止咳\n廣泛抗菌、抗黏膜發炎\n提神醒腦\n建議搭配薰衣草保濕',
    mental: '朝向世界敞開自我\n與世界連結\n增強思考邏輯性',
    emoji: '🌿', tags: ['抗菌', '免疫', '呼吸道', '中調']
  },
  {
    name: '桉油醇迷迭香', en: 'Rosemary Cineole', family: '脣形科', part: '全株',
    use: '改善外感耳鳴\n頭部以上症狀（提神醒腦）\n改善類風溼關節炎（懷孕初期、嬰幼兒、高血壓不可用）',
    physical: '提振精神\n淨化呼吸道\n增強體力',
    mental: '增強專注力與記憶力\n清理思緒',
    emoji: '🌱', tags: ['提神', '專注', '前中調']
  },
  {
    name: '澳洲尤加利', en: 'Eucalyptus Radiata', family: '桃金孃科', part: '葉片',
    use: '改善蟹足腫\n風寒或風熱型感冒\n增強免疫力、抗菌',
    physical: '化解黏液\n提振精神\n緩解鼻塞',
    mental: '清醒頭腦\n帶來清新活力',
    emoji: '💚', tags: ['感冒', '呼吸道', '前中調']
  },
  {
    name: '真正薰衣草', en: 'Lavender', family: '脣形科', part: '全株',
    use: '各種皮膚問題（如燙傷）\n鎮靜安撫、抗菌',
    physical: '緩解疼痛、放鬆\n無毒低刺激性\n平衡血壓\n消炎抗菌',
    mental: '平靜放鬆\n舒緩壓力\n安撫焦慮',
    emoji: '💜', tags: ['放鬆', '助眠', '多功能', '中調']
  },
  {
    name: '快樂鼠尾草', en: 'Clary Sage', family: '脣形科', part: '整株藥草',
    use: '緩解手足多汗症\n減輕經前緊張症候群、經痛、更年期\n抗焦慮（孕婦不可用）',
    physical: '平衡荷爾蒙\n緩解經期不適',
    mental: '釋放情緒壓力\n帶來幸福感與放鬆',
    emoji: '🌿', tags: ['賀爾蒙', '放鬆', '中後調']
  },
  {
    name: '羅馬洋甘菊', en: 'Roman Chamomile', family: '菊科', part: '花朵',
    use: '改善壓力失眠多夢\n緩解神經緊張疼痛（胃痛、腸躁症）\n安撫放鬆（兒童可用）',
    physical: '助眠\n舒緩敏感肌\n緩和消化不適',
    mental: '化解煩躁\n安撫內在小孩\n溫柔包容',
    emoji: '🌼', tags: ['助眠', '兒童', '安撫', '中調']
  },
  {
    name: '佛手柑', en: 'Bergamot', family: '芸香科', part: '果皮',
    use: '雙向調節情緒（安撫與激勵）\n甜蜜的戀愛感（具光敏性）',
    physical: '舒緩消化不適\n抗菌\n具光敏性',
    mental: '提振心情\n化解低落\n帶來陽光感',
    emoji: '🍋', tags: ['提振心情', '雙向調節', '前調', '光敏性']
  },
  {
    name: '苦橙葉', en: 'Petitgrain', family: '芸香科', part: '葉片',
    use: '抗壓、抗沮喪\n助眠、抗焦慮',
    physical: '平衡油脂\n舒緩肌肉痙攣',
    mental: '舒緩焦慮\n穩定情緒\n幫助入眠',
    emoji: '🍃', tags: ['抗焦慮', '助眠', '前中調']
  },
  {
    name: '胡椒薄荷', en: 'Peppermint', family: '脣形科', part: '全株',
    use: '透疹止癢\n緩解偏頭痛、胃脹氣\n疏散風熱（退燒）（蠶豆症及2歲以下不可用）',
    physical: '清涼提神\n緩解頭痛\n舒緩鼻塞\n助消化',
    mental: '清醒頭腦\n提升專注力\n強化自信心',
    emoji: '🌿', tags: ['提神', '頭痛', '前調']
  },
  {
    name: '茶樹', en: 'Tea Tree', family: '桃金孃科', part: '葉片',
    use: '止癢\n防腐消炎、抗菌\n驅蟲',
    physical: '廣泛抗菌\n消炎\n增強免疫',
    mental: '淨化空間\n帶來清爽感',
    emoji: '🌿', tags: ['抗菌', '淨化', '前中調']
  },
  {
    name: '甜馬鬱蘭', en: 'Sweet Marjoram', family: '脣形科', part: '整株藥草',
    use: '緩解肌肉痙攣\n緩解疼痛（經痛、頭痛）\n鎮靜神經（低血壓需注意用量）',
    physical: '緩解肌肉緊張\n補氣暖身',
    mental: '帶來安慰感\n消除孤獨',
    emoji: '🌿', tags: ['止痛', '鎮靜', '中後調']
  },
  {
    name: '沉香醇百里香', en: 'Thyme Linalool', family: '脣形科', part: '全株',
    use: '緩解腹瀉\n腸胃型感冒\n黏膜抗感染（百里香家族中最溫和，兒童可用）',
    physical: '黏膜抗感染\n抗菌',
    mental: '增強勇氣\n帶來力量',
    emoji: '🌿', tags: ['抗菌', '兒童可用', '中調']
  },
  {
    name: '波旁天竺葵', en: 'Geranium Bourbon', family: '牻牛兒科', part: '葉片',
    use: '激勵補身\n豐胸（收斂緊實）（懷孕初期不可用）',
    physical: '平衡荷爾蒙\n護膚養顏',
    mental: '平衡情緒\n療癒心靈\n提升自我愛',
    emoji: '🌹', tags: ['賀爾蒙', '護膚', '中調']
  },
  {
    name: '大馬士革玫瑰', en: 'Damask Rose', family: '薔薇科', part: '花朵',
    use: '改善纖維肌痛症\n平衡賀爾蒙\n保養抗老',
    physical: '護膚修復\n助眠\n舒緩心悸',
    mental: '深層療癒\n釋放壓力\n帶來希望',
    emoji: '🌹', tags: ['療癒', '抗老', '後調', '珍貴']
  },
  {
    name: '岩蘭草', en: 'Vetiver', family: '禾本科', part: '根部',
    use: '改善肝陽上亢頭脹痛、眼壓高\n增加深睡期、緩解焦慮失眠',
    physical: '大分子後調精油\n定香效果強\n溫和補身補氣',
    mental: '穩定焦慮\n幫助安定\n與大地連結',
    emoji: '🌾', tags: ['助眠', '定香', '後調', '接地']
  },
  {
    name: '檸檬香茅', en: 'Lemongrass', family: '禾本科', part: '全株',
    use: '祛風勝濕\n抗菌抗感染\n促進消化及血液循環\n驅蟲（需低劑量使用）',
    physical: '鎮定、消炎\n穿透力強\n抗菌力強（尤其真菌）',
    mental: '活化提振\n激勵行動力',
    emoji: '🍃', tags: ['抗菌', '驅蟲', '前調', '刺激性']
  },
  {
    name: '百里酚百里香', en: 'Thyme Thymol', family: '脣形科', part: '整株藥草',
    use: '改善灰指甲\n超強效抗菌、抗黴菌（孕婦不可用，具皮膚刺激性）',
    physical: '強大抗菌抗感染抗病毒\n提升免疫力',
    mental: '對自我存在感不足有激勵效果\n勇敢無懼',
    emoji: '💪', tags: ['強效抗菌', '免疫', '中調', '刺激性']
  },
  {
    name: '丁香花苞', en: 'Clove Bud', family: '桃金孃科', part: '花苞',
    use: '改善牙周病伴隨的牙痛與口腔異味\n保護牙齦（具皮膚刺激性）',
    physical: '強效抗菌\n止痛（局部麻醉）',
    mental: '增強意志力\n帶來溫暖感',
    emoji: '🌰', tags: ['口腔', '止痛', '後調', '刺激性']
  },
  {
    name: '甜茴香', en: 'Sweet Fennel', family: '繖形科', part: '種籽',
    use: '緩解經前緊張症候群\n改善脾胃虛寒腹痛\n通乳、豐胸（孕婦避免使用）',
    physical: '低劑量放鬆鎮定\n緩解消化不適',
    mental: '單純、正面積極的看世界',
    emoji: '🌻', tags: ['賀爾蒙', '消化', '中後調']
  },
  {
    name: '馬鞭草酮迷迭香', en: 'Rosemary Verbenone', family: '脣形科', part: '整株藥草',
    use: '緩解頭部氣結\n養肝、利肝\n頭肩頸痠痛（嬰幼兒、老人、懷孕避免使用）',
    physical: '疏通化瘀\n助去疤\n助細胞再生\n抗菌、抗病毒',
    mental: '排除舊思維及舊習慣\n冷靜清晰',
    emoji: '🌿', tags: ['養肝', '去疤', '中後調']
  },
  {
    name: '永久花', en: 'Immortelle', family: '菊科', part: '花朵',
    use: '改善牛皮癬\n疏通陳年淤塞、活血化瘀\n再生、抗老回春',
    physical: '促進傷口癒合\n溶解黏液\n疏通陳年淤塞',
    mental: '父愛\n從過去遺憾傷害中獲得重新出發的力量',
    emoji: '✨', tags: ['抗老', '癒合', '療癒', '後調', '珍貴']
  },
];

// Family emoji mapping
export const FAMILY_EMOJI: Record<string, string> = {
  '芸香科': '🍋',
  '松科': '🌲',
  '柏科': '🌿',
  '橄欖科': '🪨',
  '半日花科': '🌺',
  '菊科': '🌼',
  '番荔枝科': '🌸',
  '薑科': '🫚',
  '桃金孃科': '💚',
  '脣形科': '🌱',
  '禾本科': '🌾',
  '薔薇科': '🌹',
  '牻牛兒科': '🌹',
  '繖形科': '🌻',
};
