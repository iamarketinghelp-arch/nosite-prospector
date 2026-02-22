export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="flex flex-col items-center gap-6 px-8 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          NoSite Prospector — Find Businesses Without Websites
        </h1>
        <p className="max-w-lg text-lg text-zinc-600 dark:text-zinc-400">
          Search by location. Discover local businesses with no web presence. Export qualified
          leads.
        </p>
      </main>
    </div>
  );
}
