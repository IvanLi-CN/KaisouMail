import { createBrowserRouter, Navigate } from "react-router-dom";

import { RootLayout } from "@/app/root-layout";
import { ApiKeysPage } from "@/pages/api-keys-page";
import { LoginPage } from "@/pages/login-page";
import { MailboxDetailPage } from "@/pages/mailbox-detail-page";
import { MailboxesPage } from "@/pages/mailboxes-page";
import { MessageDetailPage } from "@/pages/message-detail-page";
import { UsersPage } from "@/pages/users-page";
import { WorkspacePage } from "@/pages/workspace-page";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/workspace" replace /> },
      { path: "workspace", element: <WorkspacePage /> },
      { path: "mailboxes", element: <MailboxesPage /> },
      { path: "mailboxes/:mailboxId", element: <MailboxDetailPage /> },
      { path: "messages/:messageId", element: <MessageDetailPage /> },
      { path: "api-keys", element: <ApiKeysPage /> },
      { path: "users", element: <UsersPage /> },
    ],
  },
]);
