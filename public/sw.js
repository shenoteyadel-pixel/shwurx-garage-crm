self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: "WURX CRM", body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "WURX CRM"
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: data.tag ? `${data.tag}-${Date.now()}` : undefined,
      data: { url: data.url || "/crm" },
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || "/crm", self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const w of windows) {
        if (w.url.startsWith(self.location.origin) && "focus" in w) {
          w.navigate(target)
          return w.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
