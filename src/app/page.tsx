export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 sm:px-10">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-700 dark:text-emerald-400">
        Beacon · foundation preview
      </p>
      <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-7xl">
        Get me home.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-300">
        One destination. One recommended plan. Beacon is being built to
        coordinate transportation options, verify a selected provider, and
        recover when plans change.
      </p>
      <p className="mt-10 border-t border-zinc-200 pt-5 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
        This is a development preview. Trip requests and provider integrations
        are not available yet.
      </p>
    </main>
  );
}
