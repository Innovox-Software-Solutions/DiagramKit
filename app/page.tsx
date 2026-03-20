import Link from 'next/link';
import styles from './home.module.css';

export default function Home() {
  return (
    <main className={styles.container}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <img src="/logo.png" alt="DiagramKit" className={styles.logo} />
          <div>
            <div className={styles.title}>DiagramKit</div>
            <div className={styles.subtitle}>Choose what you want to create</div>
          </div>
        </div>

        <div className={styles.grid}>
          <Link href="/canvas" className={styles.option}>
            <div className={styles.optionTitle}>Canvas</div>
            <div className={styles.optionDesc}>Draw diagrams, mind maps, and flows.</div>
          </Link>

          <Link href="/documents" className={styles.option}>
            <div className={styles.optionTitle}>Documents</div>
            <div className={styles.optionDesc}>Create simple docs (no sign-in required).</div>
          </Link>
        </div>
      </div>
    </main>
  );
}
