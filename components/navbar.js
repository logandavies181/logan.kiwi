import Link from 'next/link'
import styles from '../styles/Navbar.module.css'

function Navbar() {
  return (
    <header className={styles.navbar}>
      <div className={styles.logoDiv}>
        <Link href="/">
          <a className={styles.logoText}>Logan.Kiwi</a>
        </Link>
      </div>
    </header>
  )
}

export default Navbar
