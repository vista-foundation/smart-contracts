import { test, expect } from '@playwright/test';

// Configure video recording and viewport for all tests in this file
test.use({ 
  video: 'on', 
  trace: 'on',
  viewport: { width: 1280, height: 720 } // Good for video recording
});

test.describe('Custodial Transfer Video Demo', () => {

  test('Complete Video Demo: All Scenarios', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Wait for initialization
    await expect(page.locator('#sender-status')).toContainText('Ready to create contract');
    await expect(page.locator('#transaction-log')).toContainText('Demo mode activated');
    
    // Add a pause for video recording
    await page.waitForTimeout(2000);
    
    // Clear the log to start fresh
    await page.click('button:has-text("Clear Log")');
    
    // ============================================================================
    // SCENARIO 1: Party A deposits funds into contract (Locking transaction)
    // ============================================================================
    await page.fill('#deposit-amount', '50');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete and verify
    await expect(page.locator('#sender-status')).toContainText('Contract created with 50 ADA');
    await expect(page.locator('#receiver-status')).toContainText('Contract available - choose action');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated deposit of 50 ADA');
    
    // Pause for video clarity
    await page.waitForTimeout(3000);
    
    // Take screenshot for documentation
    await page.screenshot({ path: 'video-demo-1-deposit.png', fullPage: true });
    
    // ============================================================================
    // SCENARIO 2: Party A withdraws funds before delivery (Unlock by sender)
    // ============================================================================
    // First, let's demonstrate the withdraw scenario
    await page.click('#withdraw-btn');
    
    // Wait for withdrawal to complete and verify
    await expect(page.locator('#sender-status')).toContainText('Funds withdrawn - contract completed');
    await expect(page.locator('#receiver-status')).toContainText('Contract completed by sender withdrawal');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated withdrawal of 50 ADA back to sender');
    
    // Pause for video clarity
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'video-demo-2-withdraw.png', fullPage: true });
    
    // ============================================================================
    // RESET FOR NEXT SCENARIO
    // ============================================================================
    // Reload the page to reset the state
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#sender-status')).toContainText('Ready to create contract');
    await page.click('button:has-text("Clear Log")');
    
    // Pause for video clarity
    await page.waitForTimeout(2000);
    
    // ============================================================================
    // SCENARIO 3: Party B delivers to Party C (Unlock by delivery acceptance)
    // ============================================================================
    // Create a new contract for delivery scenario
    await page.fill('#deposit-amount', '35');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete
    await expect(page.locator('#sender-status')).toContainText('Contract created with 35 ADA');
    await page.waitForTimeout(2000);
    
    // Now deliver to Party C
    await page.click('#deliver-btn');
    
    // Wait for delivery to complete and verify
    await expect(page.locator('#receiver-status')).toContainText('Successfully delivered to custodian');
    await expect(page.locator('#custodian-status')).toContainText('Received 35 ADA');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated delivery of 35 ADA to custodian');
    
    // Pause for video clarity
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'video-demo-3-deliver.png', fullPage: true });
    
    // ============================================================================
    // RESET FOR FINAL SCENARIO
    // ============================================================================
    // Reload the page to reset the state
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#sender-status')).toContainText('Ready to create contract');
    await page.click('button:has-text("Clear Log")');
    
    // Pause for video clarity
    await page.waitForTimeout(2000);
    
    // ============================================================================
    // SCENARIO 4: Party B returns to Party A (Unlock by contract refusal)
    // ============================================================================
    // Create a new contract for return scenario
    await page.fill('#deposit-amount', '25');
    await page.click('#deposit-btn');
    
    // Wait for deposit to complete
    await expect(page.locator('#sender-status')).toContainText('Contract created with 25 ADA');
    await page.waitForTimeout(2000);
    
    // Now return to sender
    await page.click('#return-btn');
    
    // Wait for return to complete and verify
    await expect(page.locator('#sender-status')).toContainText('Funds returned - received 25 ADA');
    await expect(page.locator('#receiver-status')).toContainText('Successfully returned funds to sender');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated return of 25 ADA to sender');
    
    // Pause for video clarity
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'video-demo-4-return.png', fullPage: true });
    
    // Final pause for video completion
    await page.waitForTimeout(2000);
  });

  test('Individual Scenario: Locking Transaction (Deposit)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Clear Log")');
    
    // Focus on deposit scenario
    await page.fill('#deposit-amount', '100');
    await page.click('#deposit-btn');
    
    await expect(page.locator('#sender-status')).toContainText('Contract created with 100 ADA');
    await expect(page.locator('#transaction-log')).toContainText('💰 Depositing 100 ADA to contract');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated deposit of 100 ADA');
    
    // Verify button states
    await expect(page.locator('#deposit-btn')).toBeDisabled();
    await expect(page.locator('#withdraw-btn')).toBeEnabled();
    await expect(page.locator('#deliver-btn')).toBeEnabled();
    await expect(page.locator('#return-btn')).toBeEnabled();
    
    await page.waitForTimeout(2000);
  });

  test('Individual Scenario: Unlock by Withdrawal', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Clear Log")');
    
    // Create contract and then withdraw
    await page.fill('#deposit-amount', '75');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 75 ADA');
    
    await page.click('#withdraw-btn');
    await expect(page.locator('#sender-status')).toContainText('Funds withdrawn - contract completed');
    await expect(page.locator('#transaction-log')).toContainText('⬆️ Withdrawing funds (sender action)');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated withdrawal of 75 ADA back to sender');
    
    await page.waitForTimeout(2000);
  });

  test('Individual Scenario: Unlock by Delivery', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Clear Log")');
    
    // Create contract and then deliver
    await page.fill('#deposit-amount', '60');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 60 ADA');
    
    await page.click('#deliver-btn');
    await expect(page.locator('#custodian-status')).toContainText('Received 60 ADA');
    await expect(page.locator('#transaction-log')).toContainText('🚚 Delivering to Party C (custodian)');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated delivery of 60 ADA to custodian');
    
    await page.waitForTimeout(2000);
  });

  test('Individual Scenario: Unlock by Return', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.click('button:has-text("Clear Log")');
    
    // Create contract and then return
    await page.fill('#deposit-amount', '40');
    await page.click('#deposit-btn');
    await expect(page.locator('#sender-status')).toContainText('Contract created with 40 ADA');
    
    await page.click('#return-btn');
    await expect(page.locator('#sender-status')).toContainText('Funds returned - received 40 ADA');
    await expect(page.locator('#transaction-log')).toContainText('↩️ Returning to sender');
    await expect(page.locator('#transaction-log')).toContainText('✅ Simulated return of 40 ADA to sender');
    
    await page.waitForTimeout(2000);
  });
}); 