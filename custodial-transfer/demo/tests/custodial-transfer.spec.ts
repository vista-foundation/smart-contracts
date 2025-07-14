import { test, expect } from '@playwright/test';

test.describe('Custodial Transfer Smart Contract Demo', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for the demo to initialize
    await expect(page.locator('#sender-status')).toContainText('Ready to create contract');
    await expect(page.locator('#transaction-log')).toContainText('Demo mode activated');
  });

  test('Scenario 1: Party A deposits funds into contract', async ({ page }) => {
    // Set deposit amount
    await page.fill('#deposit-amount', '25');
    
    // Click deposit button
    await page.click('#deposit-btn');
    
    // Verify deposit was successful
    await expect(page.locator('#sender-status')).toContainText('Contract created with 25 ADA');
    await expect(page.locator('#receiver-status')).toContainText('Contract available - choose action');
    await expect(page.locator('#transaction-log')).toContainText('💰 Depositing 25 ADA to contract');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated deposit of 25 ADA');
    
    // Verify buttons are in correct state
    await expect(page.locator('#deposit-btn')).toBeDisabled();
    await expect(page.locator('#withdraw-btn')).toBeEnabled();
    await expect(page.locator('#deliver-btn')).toBeEnabled();
    await expect(page.locator('#return-btn')).toBeEnabled();
  });

  test('Scenario 2: Party A withdraws funds before delivery', async ({ page }) => {
    // First deposit funds
    await page.fill('#deposit-amount', '15');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete
    await expect(page.locator('#sender-status')).toContainText('Contract created with 15 ADA');
    
    // Click withdraw button
    await page.click('#withdraw-btn');
    
    // Verify withdrawal was successful
    await expect(page.locator('#sender-status')).toContainText('Funds withdrawn - contract completed');
    await expect(page.locator('#receiver-status')).toContainText('Contract completed by sender withdrawal');
    await expect(page.locator('#transaction-log')).toContainText('⬆️ Withdrawing funds (sender action)');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated withdrawal of 15 ADA back to sender');
    
    // Verify all buttons are disabled after withdrawal
    await expect(page.locator('#withdraw-btn')).toBeDisabled();
    await expect(page.locator('#deliver-btn')).toBeDisabled();
    await expect(page.locator('#return-btn')).toBeDisabled();
  });

  test('Scenario 3: Party B delivers to Party C (custodian)', async ({ page }) => {
    // First deposit funds
    await page.fill('#deposit-amount', '20');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete
    await expect(page.locator('#sender-status')).toContainText('Contract created with 20 ADA');
    
    // Click deliver button
    await page.click('#deliver-btn');
    
    // Verify delivery was successful
    await expect(page.locator('#receiver-status')).toContainText('Successfully delivered to custodian');
    await expect(page.locator('#custodian-status')).toContainText('Received 20 ADA');
    await expect(page.locator('#transaction-log')).toContainText('🚚 Delivering to Party C (custodian)');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated delivery of 20 ADA to custodian');
    
    // Verify all buttons are disabled after delivery
    await expect(page.locator('#withdraw-btn')).toBeDisabled();
    await expect(page.locator('#deliver-btn')).toBeDisabled();
    await expect(page.locator('#return-btn')).toBeDisabled();
  });

  test('Scenario 4: Party B returns funds to Party A (sender)', async ({ page }) => {
    // First deposit funds
    await page.fill('#deposit-amount', '30');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete
    await expect(page.locator('#sender-status')).toContainText('Contract created with 30 ADA');
    
    // Click return button
    await page.click('#return-btn');
    
    // Verify return was successful
    await expect(page.locator('#sender-status')).toContainText('Funds returned - received 30 ADA');
    await expect(page.locator('#receiver-status')).toContainText('Successfully returned funds to sender');
    await expect(page.locator('#transaction-log')).toContainText('↩️ Returning to sender');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated return of 30 ADA to sender');
    
    // Verify all buttons are disabled after return
    await expect(page.locator('#withdraw-btn')).toBeDisabled();
    await expect(page.locator('#deliver-btn')).toBeDisabled();
    await expect(page.locator('#return-btn')).toBeDisabled();
  });

  test('Complete workflow: Deposit → Withdraw', async ({ page }) => {
    // Deposit funds
    await page.fill('#deposit-amount', '10');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 10 ADA');
    
    // Take screenshot after deposit
    await page.screenshot({ path: 'deposit-complete.png' });
    
    // Withdraw funds
    await page.click('#withdraw-btn');
    await expect(page.locator('#sender-status')).toContainText('Funds withdrawn - contract completed');
    
    // Take screenshot after withdrawal
    await page.screenshot({ path: 'withdraw-complete.png' });
    
    // Verify complete transaction log
    const logContent = await page.locator('#transaction-log').textContent();
    expect(logContent).toContain('Depositing 10 ADA to contract');
    expect(logContent).toContain('Simulated deposit of 10 ADA');
    expect(logContent).toContain('Withdrawing funds (sender action)');
    expect(logContent).toContain('Simulated withdrawal of 10 ADA back to sender');
  });

  test('Complete workflow: Deposit → Deliver', async ({ page }) => {
    // Deposit funds
    await page.fill('#deposit-amount', '12');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 12 ADA');
    
    // Take screenshot after deposit
    await page.screenshot({ path: 'deposit-for-delivery.png' });
    
    // Deliver to custodian
    await page.click('#deliver-btn');
    await expect(page.locator('#custodian-status')).toContainText('Received 12 ADA');
    
    // Take screenshot after delivery
    await page.screenshot({ path: 'delivery-complete.png' });
    
    // Verify complete transaction log
    const logContent = await page.locator('#transaction-log').textContent();
    expect(logContent).toContain('Depositing 12 ADA to contract');
    expect(logContent).toContain('Simulated deposit of 12 ADA');
    expect(logContent).toContain('Delivering to Party C (custodian)');
    expect(logContent).toContain('Simulated delivery of 12 ADA to custodian');
  });

  test('Complete workflow: Deposit → Return', async ({ page }) => {
    // Deposit funds
    await page.fill('#deposit-amount', '8');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 8 ADA');
    
    // Take screenshot after deposit
    await page.screenshot({ path: 'deposit-for-return.png' });
    
    // Return to sender
    await page.click('#return-btn');
    await expect(page.locator('#sender-status')).toContainText('Funds returned - received 8 ADA');
    
    // Take screenshot after return
    await page.screenshot({ path: 'return-complete.png' });
    
    // Verify complete transaction log
    const logContent = await page.locator('#transaction-log').textContent();
    expect(logContent).toContain('Depositing 8 ADA to contract');
    expect(logContent).toContain('Simulated deposit of 8 ADA');
    expect(logContent).toContain('Returning to sender');
    expect(logContent).toContain('Simulated return of 8 ADA to sender');
  });

  test('UI elements are properly displayed', async ({ page }) => {
    // Check that all party sections are visible
    await expect(page.locator('.sender')).toBeVisible();
    await expect(page.locator('.receiver')).toBeVisible();
    await expect(page.locator('.custodian')).toBeVisible();
    
    // Check party headers
    await expect(page.locator('.sender .party-header')).toContainText('👤 Sender (Party A)');
    await expect(page.locator('.receiver .party-header')).toContainText('📦 Receiver (Party B)');
    await expect(page.locator('.custodian .party-header')).toContainText('🏛️ Custodian (Party C)');
    
    // Check wallet displays
    await expect(page.locator('#sender-wallet')).toContainText('1000 ADA (Demo)');
    await expect(page.locator('#receiver-wallet')).toContainText('1000 ADA (Demo)');
    await expect(page.locator('#custodian-wallet')).toContainText('1000 ADA (Demo)');
    
    // Check transaction log is visible
    await expect(page.locator('#transaction-log')).toBeVisible();
  });

  test('Log functionality works correctly', async ({ page }) => {
    // Initial log should have demo mode message
    await expect(page.locator('#transaction-log')).toContainText('Demo mode activated');
    
    // Perform an action to add to log
    await page.click('#deposit-btn');
    await expect(page.locator('#transaction-log')).toContainText('Depositing 10 ADA to contract');
    
    // Clear log
    await page.click('button:has-text("Clear Log")');
    
    // Verify log is cleared
    const logContent = await page.locator('#transaction-log').textContent();
    expect(logContent?.trim()).toBe('');
  });

  test('Input validation works correctly', async ({ page }) => {
    // Test with different amounts
    await page.fill('#deposit-amount', '5.5');
    await page.click('#deposit-btn');
    await expect(page.locator('#transaction-log')).toContainText('Depositing 5.5 ADA to contract');
    
    // Clear log for next test
    await page.click('button:has-text("Clear Log")');
    
    // Test with larger amount
    await page.fill('#deposit-amount', '100');
    await page.click('#deposit-btn');
    await expect(page.locator('#transaction-log')).toContainText('Depositing 100 ADA to contract');
  });
}); 