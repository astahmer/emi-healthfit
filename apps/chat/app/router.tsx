import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { ChatPage } from "./chat/page";
import { chatModels } from "./models";
import { RootLayout } from "./root-layout";
import AuthPage from "./auth/page";
import GenUISandboxPage from "./gen-ui/page";
import ThreadLayoutsPage from "./gen-ui/thread-layouts/page";
import MemoryPage from "./memory/page";
import NotesPage from "./notes/page";
import SettingsPage from "./settings/page";
import SummaryPage from "./summary/page";
import UploadPage from "./upload/page";
import WorkoutsPage from "./workouts/page";

const ChatSearchSchema = Schema.Struct({
  model: Schema.optional(Schema.Literals(chatModels.map((model) => model.id))),
  coach: Schema.optional(Schema.Literal("1")),
  web: Schema.optional(Schema.Literal("1")),
});

const AuthSearchSchema = Schema.Struct({
  error: Schema.optional(Schema.String),
  next: Schema.optional(Schema.String),
});

export type ChatSearch = Schema.Schema.Type<typeof ChatSearchSchema>;

const validateChatSearch = Schema.decodeUnknownSync(ChatSearchSchema);

const validateAuthSearch = Schema.decodeUnknownSync(AuthSearchSchema);

const RootRouteComponent = RootLayout;

const ChatRouteComponent = () => {
  const search = chatRoute.useSearch();
  const pathname = useLocation({ select: (location) => location.pathname });
  const navigate = useNavigate({ from: chatRoute.fullPath });
  const encodedSessionId = pathname.match(/^\/chat\/([^/]+)\/?$/)?.[1];
  const sessionId =
    encodedSessionId === undefined ? undefined : decodeURIComponent(encodedSessionId);
  return (
    <ChatPage
      sessionId={sessionId}
      search={search}
      onSearchChange={(nextSearch) =>
        navigate({ search: (currentSearch) => ({ ...currentSearch, ...nextSearch }) })
      }
      onNavigate={(nextSessionId) =>
        navigate(
          nextSessionId === undefined
            ? { to: "/chat" }
            : { to: "/chat/$sessionId", params: { sessionId: nextSessionId } },
        )
      }
    />
  );
};

const EmptyRouteComponent = () => null;

const AuthRouteComponent = () => {
  const search = authRoute.useSearch();
  return <AuthPage error={search.error} nextPath={search.next} />;
};

const rootRoute = createRootRoute({ component: RootRouteComponent });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/chat" });
  },
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  validateSearch: validateChatSearch,
  component: ChatRouteComponent,
});

const chatSessionRoute = createRoute({
  getParentRoute: () => chatRoute,
  path: "$sessionId",
  validateSearch: validateChatSearch,
  component: EmptyRouteComponent,
});

const authRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  validateSearch: validateAuthSearch,
  component: AuthRouteComponent,
});

const uploadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/upload",
  component: UploadPage,
});

const workoutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workouts",
  component: WorkoutsPage,
});

const summaryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/summary",
  component: SummaryPage,
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: NotesPage,
});

const memoryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/memory",
  component: MemoryPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});

const genUiRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gen-ui",
  component: GenUISandboxPage,
});

const threadLayoutsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/gen-ui/thread-layouts",
  component: ThreadLayoutsPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  chatRoute,
  chatSessionRoute,
  authRoute,
  uploadRoute,
  workoutsRoute,
  summaryRoute,
  notesRoute,
  memoryRoute,
  settingsRoute,
  genUiRoute,
  threadLayoutsRoute,
]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
