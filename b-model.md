## User Generation & Credit System

This is how the generation and credit system should work.

### 1. Free Generations for New Installs

Every new app installation should receive **2 free generations**.

However, we need a reliable way to permanently identify the device so that uninstalling and reinstalling the app does **not** reset the free-generation allowance.

The rules should be:

* A device receives **2 free generations total**.
* The device should be uniquely identifiable even if the user:

  * Uninstalls the app.
  * Reinstalls the app.
  * Installs the app multiple times.
* If the user has already used both free generations and then uninstalls/reinstalls the app, they should receive **0 additional free generations**.
* If the user has only used 1 of their 2 free generations, reinstalling the app should still leave them with only **1 remaining generation**.
* The free-generation allowance is therefore tied to the device, **not to the installation**.

We should make sure this system is resistant to users repeatedly reinstalling the app to obtain additional free generations.

### 2. Account Required for Purchased Generations

Users should be able to try the app without creating an account using their 2 free generations.

However, once they want to **purchase additional generations**, they must create an account.

The account will allow us to:

* Store and manage their purchased credits.
* Track their generation history.
* Keep their credits associated with their account.
* Access their credits across app sessions/devices where appropriate.
* Manage their account and settings.

### 3. Credit System

We should use a simple **pay-as-you-go credit system** rather than a monthly subscription.

**1 generation = 1 credit.**

Our target pricing is approximately **$0.99 per generation**, with discounted pricing for larger bundles.

Initial packages:

* **5 generations — $4.99**
* **10 generations — $9.99**
* **20 generations — regular price $19.99, discounted price $14.99**

The 20-generation package normally costs **$19.99**, but we will offer it for **$14.99**.

This represents a discount of:

**$19.99 − $14.99 = $5.00**

**$5.00 ÷ $19.99 × 100 = approximately 25.0%**

Therefore, the 20-generation package will be offered at approximately a **25% discount**.

The discounted 20-generation option is particularly useful for users who may use the app more frequently, such as creators, barbers, studios, or other professional users.

We should also consider allowing users to purchase a **custom number of generations** in the future if there is demand for it.

### 4. Account & Settings

Once a user has an account, the Settings page should contain all account and credit-management functionality.

The user should be able to:

* See their current credit balance.
* Purchase additional generations.
* View their available generation packages.
* Manage their account.
* Log out.
* Clear/delete their app data where applicable.
* Manage their account data/privacy settings.
* See relevant account information.

The overall goal is to make the Settings page the central location for **account management and credit management**.

### 5. Generation Flow

The basic flow should be:

**New user → 2 free generations → wants more generations → create account → purchase credits → use credits for additional generations.**

Free generations and purchased credits should be tracked separately so that we always know where a generation came from.

### 6. Generation Cost & Profitability

Our current estimated cost is approximately:

**$0.053 per generation**

So providing the initial 2 free generations costs us approximately:

**2 × $0.053 = $0.106**

Therefore, the cost of the 2 free generations is approximately **$0.11 per user**.

For paid generations, we need to calculate our actual profit after accounting for the platform's commission.

Assuming the Apple App Store / Google Play Store takes approximately **15%**, the estimated profitability of each package is as follows.

#### 5-Generation Package

**$4.99 sale**

→ **$0.75 platform fee**

→ **$4.24 revenue after platform fee**

→ **5 × $0.053 = $0.265 generation cost**

→ **approximately $3.98 gross profit**

The approximate gross margin is:

**$3.98 ÷ $4.99 × 100 = approximately 79.7%**

#### 10-Generation Package

**$9.99 sale**

→ **$1.50 platform fee**

→ **$8.49 revenue after platform fee**

→ **10 × $0.053 = $0.53 generation cost**

→ **approximately $7.96 gross profit**

The approximate gross margin is:

**$7.96 ÷ $9.99 × 100 = approximately 79.7%**

#### 20-Generation Package at the Regular Price

The regular price is **$19.99**.

**$19.99 sale**

→ **$3.00 platform fee**

→ **$16.99 revenue after platform fee**

→ **20 × $0.053 = $1.06 generation cost**

→ **approximately $15.93 gross profit**

The approximate gross margin at the regular price is:

**$15.93 ÷ $19.99 × 100 = approximately 79.7%**

#### 20-Generation Package at the Discounted Price

The discounted price is **$14.99**.

**$14.99 sale**

→ **$2.25 platform fee**

→ **$12.74 revenue after platform fee**

→ **20 × $0.053 = $1.06 generation cost**

→ **approximately $11.68 gross profit**

The approximate gross margin at the discounted price is:

**$11.68 ÷ $14.99 × 100 = approximately 77.9%**

Therefore, the discounted 20-generation package provides approximately:

* **$11.68 gross profit per package**
* **$0.584 gross profit per generation**
* **Approximately 77.9% gross margin**

The discount reduces the gross profit by approximately:

**$15.93 − $11.68 = $4.25 per package**

Compared with the regular $19.99 price, the discounted package reduces the gross margin from approximately **79.7%** to approximately **77.9%**, while still maintaining a strong margin.

For reference, the effective price per generation is:

* 5-generation package: **$4.99 ÷ 5 = approximately $1.00 per generation**
* 10-generation package: **$9.99 ÷ 10 = approximately $1.00 per generation**
* 20-generation package at regular price: **$19.99 ÷ 20 = approximately $1.00 per generation**
* 20-generation package at discounted price: **$14.99 ÷ 20 = approximately $0.75 per generation**

This will allow us to clearly understand the profitability of each package after the app-store commission and generation costs.

### 7. Important Backend Requirements

The backend should maintain a reliable record of:

* Device identifier / installation identity
* Free generations granted
* Free generations used
* Purchased credits
* Credits consumed
* Generation transactions
* Purchase receipts / transaction IDs
* Account information
* Credit balance
* Generation history

The credit system must be **server-side and transactional**. The client should never be trusted to determine how many credits a user has.

Every generation should verify that the user has an available generation/credit before starting the generation process, then safely deduct it so that users cannot accidentally or intentionally generate multiple times using the same credit.

### Final Goal

The system should be simple for the user:

**Try the app for free → get 2 generations → create an account when they want more → buy generations whenever they need them → receive a 25% discount on the 20-generation package → no monthly subscription required.**

At the same time, the backend should give us reliable control over free usage, purchased credits, transactions, discounts, and generation costs so that the system remains secure and profitable.
