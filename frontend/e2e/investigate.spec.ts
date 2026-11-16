import { expect, test } from '@playwright/test'

test('ask, watch the panel fill, open evidence, approve, find the chat again', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What should we look into?' })).toBeVisible()

  const question = page.getByLabel('Question')
  await question.fill('Yield dropped on recent lots. Find the cause and recommend an action.')
  await question.press('Enter')

  // The question appears in the chat; the agent's steps stream in, and the panel opens beside it.
  const chat = page.getByRole('main')
  const panel = page.getByRole('complementary', { name: 'Evidence' })
  await expect(chat.getByText('Yield dropped on recent lots. Find the cause and recommend an action.').first()).toBeVisible()
  await expect(page.locator('.steplog.live')).toBeVisible()
  await expect(panel.getByRole('tab', { name: /Investigation/ })).toBeVisible()
  await expect(panel.getByRole('region', { name: 'Flagged lots' })).toBeVisible()

  // The answer names the culprit; the steps fold into one line.
  await expect(chat.getByText('ETCH-03-B is the common cause.')).toBeVisible({ timeout: 30_000 })
  await expect(panel.locator('.thread .beat')).toHaveCount(9)
  await expect(chat.getByRole('button', { name: /Investigated in 9 steps/ })).toBeVisible()
  await expect(panel.getByText(/54 of 55 bad wafers went through ETCH-03-B/)).toBeVisible()
  await expect(panel.getByRole('img', { name: 'Wafer map of L2610040-04' })).toBeVisible()

  // The evidence button is a toggle: the trace is showing, so it hides it, then brings it back.
  await chat.getByRole('button', { name: 'Hide evidence', exact: true }).click()
  await expect(page.locator('.ws-wrap')).not.toHaveClass(/open/)
  await chat.getByRole('button', { name: 'Show evidence', exact: true }).click()
  await expect(panel.locator('.thread .beat')).toHaveCount(9)

  // A step in the panel opens to its raw result.
  await panel.getByRole('button', { name: /^find_commonality/ }).click()
  await expect(panel.locator('.beat-raw')).toContainText('"chamber_id": "ETCH-03-B"')

  // A citation in the answer opens the cited passage as a new tab.
  const cite = chat.locator('button.cite').first()
  const chunk = (await cite.textContent())!
  await cite.click()
  await expect(panel.getByRole('tab', { name: chunk })).toHaveAttribute('aria-selected', 'true')
  await expect(panel.locator('.passage')).toBeVisible()

  // A chamber in the answer opens its SPC chart.
  await chat.locator('button.entity', { hasText: 'ETCH-03-B' }).first().click()
  await expect(panel.getByRole('tab', { name: 'SPC ETCH-03-B' })).toBeVisible()

  // The panel resizes by dragging its edge.
  const before = (await panel.boundingBox())!.width
  const edge = page.getByRole('separator', { name: 'Resize panel' })
  const box = (await edge.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(box.x - 120, box.y + 200, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeGreaterThan(before + 80)

  // The work order is approved by a person, in the panel.
  await chat.getByRole('button', { name: /WO-\d+ needs your approval/ }).click()
  const approve = panel.getByRole('button', { name: 'Approve' })
  await expect(approve).toBeDisabled()
  await panel.getByLabel('Decide as').fill('J. Kim')
  await approve.click()
  await expect(panel.getByText(/Approved by J\. Kim/)).toBeVisible()
  await expect(chat.getByRole('button', { name: /approved by J\. Kim/ })).toBeVisible()

  // The chat is saved: after a reload it is in Recents and opens as it was.
  await page.reload()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await nav.getByRole('button', { name: /^Yield dropped on recent lots/ }).click()
  await expect(page.getByRole('main').getByText('ETCH-03-B is the common cause.')).toBeVisible()

  await nav.getByRole('button', { name: 'Audit log' }).click()
  const audit = page.getByRole('region', { name: 'Audit log' })
  await expect(audit.getByText('approved_work_order')).toBeVisible()
  await expect(audit.getByText('tool:find_commonality').first()).toBeVisible()
})

test('fits a phone screen without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: /Is ETCH-03-B in control/ }).click()
  await expect(page.getByText('ETCH-03-B is the common cause.')).toBeVisible({ timeout: 30_000 })
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  // Evidence slides over the chat on a phone.
  await page.getByRole('button', { name: 'Show evidence' }).click()
  await expect(page.getByRole('complementary', { name: 'Evidence' }).locator('.thread .beat')).toHaveCount(9)
})
