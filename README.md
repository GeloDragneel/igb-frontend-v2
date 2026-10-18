# BizDesk

Business admin app built with React 18, React Router 6 and Vite.

## Pages

- **Task**
  - Sales – `/task/sales`
  - Expenses – `/task/expenses`
  - Purchases – `/task/purchases`
- **Setup**
  - Product – `/setup/product`
  - Customer – `/setup/customer`

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually http://localhost:5173).

Build for production:

```bash
npm run build
```

The output goes to `dist/`. Because the app uses browser routing, your server must send `index.html` for every route (for Apache, add a rewrite rule; for XAMPP put the `dist` contents in a folder and add an `.htaccess` – see below).

```apache
# dist/.htaccess
RewriteEngine On
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]
```

If you deploy to a sub-folder (for example `http://localhost/bizdesk/`), set `base: "/bizdesk/"` in `vite.config.js`, use `<BrowserRouter basename="/bizdesk">` in `src/main.jsx`, and change `RewriteBase`/the last rule to `/bizdesk/`.

## How data works

- All data lives in `src/context/AppDataContext.jsx` and is saved to the browser's localStorage.
- Sample data is in `src/data/sampleData.js`. Use **Reset data** in the sidebar to restore it.
- Saving a sale takes stock out of products (and is blocked if stock is too low). Editing or deleting a sale puts the stock back.
- A purchase adds stock only when its status is **Received**.
- Customer balance = unpaid sales + the unpaid part of partial sales.

To connect a real backend (PHP/MySQL, etc.), replace the `save…` and `delete…` functions in the context with API calls and load the initial data with `fetch`.

## Structure

```
src/
  main.jsx, App.jsx, styles.css
  data/sampleData.js
  context/AppDataContext.jsx
  utils/format.js
  components/  Layout, Sidebar, Header, Breadcrumbs, StatCard, SearchCard,
               DataTable, RowMenu, Modal (+ Drawer, Field), ConfirmDialog,
               Toast, Badge, Avatar, Icons, LineItemsEditor, routesMeta
  pages/
    task/Sales.jsx, task/Expenses.jsx, task/Purchases.jsx
    setup/Product.jsx, setup/Customer.jsx
    NotFound.jsx
```
