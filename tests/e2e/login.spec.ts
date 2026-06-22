import { test, expect } from '@playwright/test'

const POCKETBASE_URL = 'http://127.0.0.1:8090'
const TEST_USER = {
  email: 'playwright-e2e@test.com',
  password: 'TestPass123!',
}

async function ensureTestUser() {
  // 先尝试登录，成功说明用户已存在
  const loginRes = await fetch(`${POCKETBASE_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: TEST_USER.email, password: TEST_USER.password }),
  })
  if (loginRes.ok) return

  // 登录失败则创建
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
    throw new Error(`Failed to create test user: ${res.status}`)
  }
}

test.describe('登录流程', () => {

  test.beforeAll(async () => {
    await ensureTestUser()
  })

  test('1.1 未登录时显示登录页面', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('登录账号')).toBeVisible()
    await expect(page.getByPlaceholder('your@email.com')).toBeVisible()
    await expect(page.getByPlaceholder('输入密码')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
  })

  test('1.2 登录成功后显示项目库页面', async ({ page }) => {
    await page.goto('/')

    await page.getByPlaceholder('your@email.com').fill(TEST_USER.email)
    await page.getByPlaceholder('输入密码').fill(TEST_USER.password)
    await page.getByRole('button', { name: '登录', exact: true }).click()

    await expect(page.getByText('项目库')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(TEST_USER.email)).toBeVisible()
  })

  test('1.3 登录失败时显示错误信息', async ({ page }) => {
    await page.goto('/')

    await page.getByPlaceholder('your@email.com').fill('invalid@test.com')
    await page.getByPlaceholder('输入密码').fill('wrongpassword')
    await page.getByRole('button', { name: '登录', exact: true }).click()

    await expect(page.getByText('Failed to authenticate.')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('登录账号')).toBeVisible()
  })

})
