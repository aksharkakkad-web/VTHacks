import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import styles from "./welcome.module.css";

export const metadata: Metadata = {
  title: "Welcome to Beacon",
  description: "Beacon helps coordinate your way home. Not an emergency service.",
};

export default async function BeaconWelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; presenter?: string }>;
}) {
  const query = await searchParams;
  const homeHref = query.demo === "1" ? `/onboarding/home?demo=1${query.presenter === "1" ? "&presenter=1" : ""}` : "/onboarding/home";
  return (
    <main className={styles.stage}>
      <section className={styles.screen} aria-labelledby="welcome-heading">
        <Image
          className={styles.logo}
          src="/beacon-welcome-logo.webp"
          alt="Beacon"
          width={1254}
          height={1254}
          priority
          unoptimized
        />

        <div className={styles.intro}>
          <h1 id="welcome-heading">Get me home.</h1>
          <p>Beacon handles the rest.</p>
        </div>

        <div className={styles.landscape} aria-hidden="true" />

        <nav className={styles.actions} aria-label="Welcome actions">
          <Link className={styles.primaryAction} href={homeHref}>
            Get started <span aria-hidden="true">→</span>
          </Link>
        </nav>
      </section>
    </main>
  );
}
