import { createBrowserRouter, Navigate } from "react-router-dom";
import { RootLayout } from "@/app/root-layout";
import { RouteErrorBoundary } from "@/app/route-error-boundary";
import { ApiKeysDocsPage } from "@/pages/api-keys-docs-page";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { DomainsPage } from "@/pages/domains-page";
import { LoginPage } from "@/pages/login-page";
import { MailboxDetailPage } from "@/pages/mailbox-detail-page";
import { MailboxesPage } from "@/pages/mailboxes-page";
import { MessageDetailPage } from "@/pages/message-detail-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { UsersPage } from "@/pages/users-page";
import { WorkspacePage } from "@/pages/workspace-page";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: "/",
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <Navigate to="/workspace" replace /> },
      { path: "workspace", element: <WorkspacePage /> },
      { path: "mailboxes", element: <MailboxesPage /> },
      { path: "mailboxes/:mailboxId", element: <MailboxDetailPage /> },
      { path: "messages/:messageId", element: <MessageDetailPage /> },
      { path: "api-keys", element: <ApiKeysPage /> },
      { path: "api-keys/docs", element: <ApiKeysDocsPage /> },
      { path: "domains", element: <DomainsPage /> },
      { path: "users", element: <UsersPage /> },
    ],
  },
  {
    path: "*",
    element: <NotFoundPage />,
    errorElement: <RouteErrorBoundary />,
  },
]);
