import styles from '../styles/TableHeader.module.css'

function TableHeader(props) {
  return (
    <div className={styles.headerContainer}>
      {props.children}
    </div>
  )
}

export default TableHeader
