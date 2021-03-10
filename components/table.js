import styles from '../styles/Table.module.css'

function Table(props) {
  return (
    <div className={styles.tableContainer}>
      {props.children}
    </div>
  )
}

export default Table
