export const metadata = {
  title: "Realtime Transcript",
  description: "Mic → OpenAI Realtime → on-screen transcript",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
