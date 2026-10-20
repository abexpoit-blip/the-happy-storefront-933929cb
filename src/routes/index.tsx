import { createFileRoute } from "@tanstack/react-router";
import ClientApp from "@/ClientApp";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zoru Shop — Главная" },
      { name: "description", content: "Zoru Shop — главная страница магазина." },
      { property: "og:title", content: "Zoru Shop — Главная" },
      { property: "og:description", content: "Zoru Shop — главная страница магазина." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClientApp,
});
