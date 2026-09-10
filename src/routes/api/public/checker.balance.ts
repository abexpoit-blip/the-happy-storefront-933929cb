import { createFileRoute } from "@tanstack/react-router";
import { authorizeApiKey, json } from "@/lib/apiAuth.server";

export const Route = createFileRoute("/api/public/checker/balance")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorizeApiKey(request, 0);
        if ("error" in auth) return json({ status: "error", message: auth.error }, auth.status);
        return json({ status: "success", label: auth.key.label, credits: auth.key.credits });
      },
    },
  },
});
