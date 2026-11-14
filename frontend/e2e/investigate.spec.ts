import { expect, test } from '@playwright/test'

test('ask, watch the workspace fill, open a lot, approve the work order', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'What should we look into?' })).toBeVisible()

  const question = page.getByLabel('Question')
  await question.fill('Yield dropped on recent lots. Find the cause and recommend an action.')
  await question.press('Enter')

  // The workspace opens and cards arrive while the agent is still working.
  const workspace = page.getByRole('region', { name: 'Workspace', exact: true })
  await expect(workspace).toBeVisible()
  await expect(page.getByRole('region', { name: 'Flagged lots' })).toBeVisible()
  await expect(page.getByText('… running').or(page.getByText('Choosing the next step…'))).toBeVisible()

  // The final answer names the culprit and cites a source.
  await expect(page.getByText('ETCH-03-B is the common cause.')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.trace li')).toHaveCount(9)
  await expect(page.getByRole('link', { name: /\[SOP-ETCH-001#\d+\]/ })).toBeVisible()
  await expect(page.getByRole('region', { name: 'SPC chart ETCH-03-B' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Wafer map of L2610040-04: edge ring/ })).toBeVisible()

  // A trace line opens to show its raw result.
  await page.getByRole('button', { name: /find_commonality/ }).click()
  await expect(page.locator('.trace-detail')).toContainText('"chamber_id": "ETCH-03-B"')

  // Clicking a flagged lot opens it and its worst wafer's map.
  await page.getByRole('region', { name: 'Flagged lots' }).getByRole('button', { name: 'L2610039' }).click()
  await expect(page.getByRole('region', { name: 'Lot L2610039' })).toBeVisible()
  await expect(page.getByRole('img', { name: /Wafer map of L2610039-/ })).toBeVisible()

  // Approve needs a name; the decision lands in the audit log.
  const approve = page.getByRole('button', { name: 'Approve' })
  await expect(approve).toBeDisabled()
  await page.getByLabel('Decide as').fill('J. Kim')
  await approve.click()
  await expect(page.getByText(/Approved by J\. Kim/)).toBeVisible()

  await page.getByRole('button', { name: 'Audit log' }).click()
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
})
