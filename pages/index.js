import Head from 'next/head'
import Link from 'next/link'
import styles from '../styles/Home.module.css'
import container from '../styles/Container.module.css'

export default function Home() {
  return (
    <div className={container.container}>
      <Head>
        <title>logan.kiwi</title>
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Logan.Kiwi
        </h1>

        <p className={styles.description}>
            Welcome to my personal site!
        </p>

        <div className={styles.grid}>
          <Link href="/woops" >
            <a className={styles.card}>
              woops!
            </a>
          </Link>
          <Link href="/test" >
            <a className={styles.card}>
              test
            </a>
          </Link>
          <Link href="/timetable" >
            <a className={styles.card}>
              Timetable
            </a>
          </Link>
        </div>
      </main>
    </div>
  )
}
