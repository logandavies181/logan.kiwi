import styles from '../styles/Container.module.css'
import Head from 'next/head'
import Navbar from './navbar.js'
import Footer from './footer.js'

const Layout = props => (
    <div className={styles.container}>
      <Head>
        <title>logan.kiwi</title>
      </Head>
      <Navbar />
        { props.children }
      <Footer />
    </div>
)

export default Layout;
