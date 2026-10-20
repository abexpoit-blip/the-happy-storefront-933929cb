import { createFileRoute } from "@tanstack/react-router";
import ClientApp from "@/ClientApp";

export const Route = createFileRoute("/$")({
  head: () => ({
    meta: [
      { title: "Zoru Shop — Личный кабинет" },
      { name: "description", content: "Zoru Shop — вход и управление личным кабинетом." },
      { property: "og:title", content: "Zoru Shop — Личный кабинет" },
      { property: "og:description", content: "Zoru Shop — вход и управление личным кабинетом." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientApp,
});
