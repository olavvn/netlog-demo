# Add Manager and Checker Signup Features

We will add signup functionalities for both NetSpa Administrators (`netspa_manager`) and Site Checkers (`site`) in the `netlog` project. This includes creating backend endpoints, adding frontend signup pages, and linking them from the respective login screens.

## User Review Required

> [!IMPORTANT]
> - **Administrator (`manager`) Role Option**: The administrator signup page will allow selecting between `admin` and `operator` roles.
> - **Checker (`site`) Location Coordinates**: The site registration page will include input fields for `latitude` and `longitude`. We will pre-fill them with neutral default values or let users enter them.
> - **Git Branch**: Since we are already working on the `main` branch (working tree clean), we will make these changes directly in the `main` branch.

## Proposed Changes

### Backend Components (`netlog-server`)

#### [MODIFY] [auth.py](file:///c:/Users/KDT56/Projects/netlog/netlog-server/app/routers/auth.py)
We will add:
- Request schemas: `ManagerSignupRequest` and `SiteSignupRequest`.
- Endpoint `POST /auth/manager/signup` to register a new administrator/operator.
- Endpoint `POST /auth/site/signup` to register a new site (checker).

### Frontend Components (`netlog-client`)

#### [NEW] [CheckerSignupPage.jsx](file:///c:/Users/KDT56/Projects/netlog/netlog-client/src/pages/CheckerSignupPage.jsx)
A new page styled consistently with `CheckerLoginPage` to register a new collection site (checker).
- Fields: `site_code`, `name`, `region`, `address` (optional), `latitude`, `longitude`, `pin`.

#### [NEW] [DashboardSignupPage.jsx](file:///c:/Users/KDT56/Projects/netlog/netlog-client/src/pages/DashboardSignupPage.jsx)
A new page styled consistently with `DashboardLoginPage` to register a new manager.
- Fields: `name`, `login_id`, `password`, `role`.

#### [MODIFY] [CheckerLoginPage.jsx](file:///c:/Users/KDT56/Projects/netlog/netlog-client/src/pages/CheckerLoginPage.jsx)
Add a "집하장 등록 (회원가입)" link pointing to `/checker/signup`.

#### [MODIFY] [DashboardLoginPage.jsx](file:///c:/Users/KDT56/Projects/netlog/netlog-client/src/pages/DashboardLoginPage.jsx)
Add a "새 관리자 계정 생성 (회원가입)" link pointing to `/dashboard/signup`.

#### [MODIFY] [App.jsx](file:///c:/Users/KDT56/Projects/netlog/netlog-client/src/App.jsx)
Add routes for `/checker/signup` and `/dashboard/signup`.

---

## Detailed Implementation Steps

### Step 1: Backend Implementation (`netlog-server`)
1. Edit `netlog-server/app/routers/auth.py` to add schemas:
   ```python
   class ManagerSignupRequest(BaseModel):
       name: str
       login_id: str
       password: str
       role: str = "operator" # admin or operator

   class SiteSignupRequest(BaseModel):
       site_code: str
       name: str
       region: str
       address: str | None = None
       latitude: float
       longitude: float
       pin: str
   ```
2. Implement `POST /auth/manager/signup` with duplicate `login_id` checking.
3. Implement `POST /auth/site/signup` with duplicate `site_code` checking.

### Step 2: React Routing (`netlog-client`)
1. Register paths in `src/App.jsx`:
   - `/checker/signup` -> `<CheckerSignupPage />`
   - `/dashboard/signup` -> `<DashboardSignupPage />`

### Step 3: Frontend Signup Pages (`netlog-client`)
1. Create `CheckerSignupPage.jsx` under `src/pages/` containing input fields and validation (e.g. 6-digit PIN).
2. Create `DashboardSignupPage.jsx` under `src/pages/` containing name, ID, password, and role selector.

### Step 4: Login Pages Links
1. Update `CheckerLoginPage.jsx` to display a signup link below the login card.
2. Update `DashboardLoginPage.jsx` to display a signup link below the login card.

---

## Verification Plan

### Automated Tests
- We will verify that the server launches without errors.

### Manual Verification
- Navigate to `/checker/login` and verify the signup link exists.
- Click the link, fill in the site signup form, submit it, and verify that the database registers the new site.
- Attempt to log in with the new site's code and PIN to confirm successful signup.
- Navigate to `/dashboard/login` and verify the signup link exists.
- Click the link, register a new manager, and verify that the manager is saved in the database.
- Attempt to log in with the new manager's credentials.
