import { test, expect } from '@playwright/test'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const TEST_USER = {
  email: 'playwright-e2e@test.com',
  password: 'TestPass123!',
}

// =============================================
// Mock 数据
// =============================================

const MOCK_SCRIPT_DATA = {
  title: '深空探索',
  genre: '科幻',
  logline: '一艘星舰在深空中发现了一颗未知的类地行星。',
  characters: [
    { id: '1', name: '陈曦', gender: '女', age: '28', personality: '聪明冷静', visualPrompt: '年轻女科学家，身穿星舰制服，干练短发', negativePrompt: '模糊, 变形' },
    { id: '2', name: '林远峰', gender: '男', age: '40', personality: '稳重果断', visualPrompt: '中年男舰长，身穿星舰制服，面容坚毅', negativePrompt: '模糊, 变形' },
  ],
  scenes: [
    { id: '1', location: '星舰舰桥', time: '星际航行中', atmosphere: '紧张专注', visualPrompt: '高科技星舰舰桥，全息星图在闪烁', negativePrompt: '模糊' },
  ],
  storyParagraphs: [
    { id: 1, text: '陈曦正在监测星图数据。', sceneRefId: '1' },
    { id: 2, text: '林远峰来到全息台前。', sceneRefId: '1' },
  ],
}

const MOCK_ART_DIRECTION = {
  colorPalette: { primary: '深蓝', secondary: '银灰', accent: '青色', skinTones: '自然肤色', saturation: '中等', temperature: '冷色调' },
  characterDesignRules: { proportions: '写实', eyeStyle: '写实', lineWeight: '适中', detailLevel: '高' },
  lightingStyle: '冷色科技光',
  textureStyle: '金属质感',
  moodKeywords: ['科幻', '探索', '未知'],
  consistencyAnchors: '所有画面保持冷色调科技感',
}

const MOCK_SHOT = {
  shots: [{
    id: 'shot-1',
    sceneId: '1',
    actionSummary: '陈曦正在监测星图数据',
    dialogue: '舰长，发现异常信号！',
    cameraMovement: 'Static Shot',
    shotSize: '中景',
    characters: ['1', '2'],
    shotType: 'normal',
    keyframes: [
      { id: 'kf-1', type: 'start', visualPrompt: '陈曦在全息台前工作，星图闪烁' },
      { id: 'kf-2', type: 'end', visualPrompt: '林远峰走向全息台' },
    ],
  }],
}

const MOCK_VISUAL_PROMPT = {
  visualPrompt: '一个角色在星舰环境中',
  negativePrompt: '模糊, 变形',
}

const PLACEHOLDER_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// =============================================
// Helpers
// =============================================

async function ensureTestUser() {
  // 先尝试登录，如果成功说明用户已存在
  const loginRes = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: TEST_USER.email, password: TEST_USER.password }),
  })
  if (loginRes.ok) return

  // 登录失败则创建用户
  const res = await fetch(`${POCKETBASE_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password,
      passwordConfirm: TEST_USER.password,
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create test user: ${res.status} ${await res.text()}`)
  }
}

/**
 * 拦截所有 LLM 和图片 API 调用，返回 mock 数据
 */
async function setupMockRoutes(page: any) {

  // ---- 拦截 LLM 调用 (BigModel API) ----
  await page.route('**/bigmodel/**', async (route: any) => {
    const postData = route.request().postDataJSON()
    const prompt = postData?.messages?.[0]?.content || ''

    let content: string

    if (prompt.includes('Analyze the text')) {
      // parseScriptToData
      content = JSON.stringify(MOCK_SCRIPT_DATA)
    } else if (prompt.includes('Art Director')) {
      // generateArtDirection
      content = JSON.stringify(MOCK_ART_DIRECTION)
    } else if (prompt.includes('cinematographer') || prompt.includes('shot list')) {
      // generateShotList
      content = JSON.stringify(MOCK_SHOT)
    } else if (prompt.includes('"results"') || prompt.includes('visual prompts for multiple characters')) {
      // generateAllCharacterPrompts (batch) — 需要 results 数组
      content = JSON.stringify({
        results: MOCK_SCRIPT_DATA.characters.map(c => ({
          characterName: c.name,
          visualPrompt: c.visualPrompt || 'mock character',
          negativePrompt: c.negativePrompt || 'mock negative',
        })),
      })
    } else if (prompt.includes('visual prompt for character') || prompt.includes('Create visual prompt for character')) {
      // generateCharacterVisualPrompt (individual)
      content = JSON.stringify(MOCK_VISUAL_PROMPT)
    } else if (prompt.includes('visual prompt for scene') || prompt.includes('scene visual prompt')) {
      // generateVisualPrompt for scene
      content = JSON.stringify(MOCK_VISUAL_PROMPT)
    } else {
      // Fallback
      content = JSON.stringify(MOCK_VISUAL_PROMPT)
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content } }],
      }),
    })
  })

  // ---- 拦截图片生成 (Drama Backend) ----
  await page.route('**/drama-api/api/v1/generate/txt2image', async (route: any) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ full_url: 'http://117.50.108.73:8082/api/file/mock-character.png' }),
    })
  })

  // ---- 拦截图片下载 (dev 模式下 URL 会重写为 /drama-api) ----
  await page.route('**/drama-api/api/file/mock-character.png', async (route: any) => {
    await route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(PLACEHOLDER_PNG_BASE64, 'base64'),
    })
  })

  // ---- 拦截 Edge-TTS（防止页面报错） ----
  await page.route('**/edge-tts/**', async (route: any) => {
    await route.fulfill({ status: 200, body: '' })
  })
}

// =============================================
// Tests
// =============================================

test.describe('项目完整流程', () => {

  test.beforeAll(async () => {
    await ensureTestUser()
  })

  test('完整流程: 登录 → 创建项目 → AI拆分剧本 → 角色场景 → 生成角色定妆照', async ({ page }) => {
    test.setTimeout(120_000)

    await setupMockRoutes(page)

    // 跳过新手引导弹窗 & 设置 API Key（让 API Key 检查通过，但实际请求被路由拦截）
    await page.addInitScript(() => {
      localStorage.setItem('bigbanana_onboarding_completed', 'true')
      localStorage.setItem('global_api_key', 'mock-key-for-testing')
    })

    // ==========================
    // 1. 登录
    // ==========================
    await page.goto('/')
    await page.getByPlaceholder('your@email.com').fill(TEST_USER.email)
    await page.getByPlaceholder('输入密码').fill(TEST_USER.password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByText('项目库')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(TEST_USER.email)).toBeVisible()

    // ==========================
    // 2. 创建新项目 → 进入剧本阶段
    // ==========================
    await page.getByText('新建项目').click()
    await page.waitForTimeout(500)

    // 修改参数：目标时长 → 60秒
    await page.getByText('60秒 (预告)').click()
    // 修改参数：视觉风格 → 日式动漫
    await page.getByText('日式动漫').click()
    // 修改项目标题
    const titleInput = page.locator('input[type="text"], input[placeholder*="标题"], input:not([type="email"]):not([type="password"])').first()
    if (await titleInput.isVisible()) {
      await titleInput.fill('E2E测试项目')
    }

    // ==========================
    // 3. AI 拆分剧本
    // ==========================
    await page.getByRole('button', { name: '生成分镜脚本' }).click()

    // 等待 AI 解析完成，页面切换到分镜视图
    await expect(page.getByText('拍摄清单')).toBeVisible({ timeout: 120_000 })
    // 验证场景名称出现（来自 mock 数据）
    await expect(page.getByRole('heading', { name: '星舰舰桥' })).toBeVisible({ timeout: 10000 })

    // ==========================
    // 4. 切换到角色与场景阶段
    // ==========================
    await page.getByText('角色与场景').click()

    // 等待角色列表加载
    await expect(page.getByRole('heading', { name: '陈曦' })).toBeVisible({ timeout: 10000 })

    // ==========================
    // 5. 一键生成所有角色定妆照
    // ==========================
    const batchBtn = page.getByRole('button', { name: '一键生成所有角色' })
    await expect(batchBtn).toBeVisible({ timeout: 10000 })
    await batchBtn.click()

    // 等待生成完成：角色卡片中出现 <img> 标签
    const characterImg = page.locator('img[alt]').first()
    await expect(characterImg).toBeVisible({ timeout: 60_000 })

    // 验证角色名称仍然可见
    await expect(page.getByRole('heading', { name: '陈曦' })).toBeVisible()

    // 暂停 5 秒，让你在 --headed 模式下能看到最终结果
    await page.waitForTimeout(5000)
  })

  test.afterAll(async () => {
    // 清理：登录 PocketBase 并删除测试用户的所有项目
    try {
      const authRes = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: TEST_USER.email, password: TEST_USER.password }),
      })
      if (!authRes.ok) return
      const { token } = await authRes.json()

      const projectsRes = await fetch(`${POCKETBASE_URL}/api/collections/projects/records?perPage=100`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!projectsRes.ok) return
      const { items } = await projectsRes.json()

      await Promise.all(items.map((p: any) =>
        fetch(`${POCKETBASE_URL}/api/collections/projects/records/${p.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      ))
    } catch {
      // 清理失败不影响测试结果
    }
  })

})
