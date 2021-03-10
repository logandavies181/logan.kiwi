import styles from '../styles/TableRow.module.css'

function TableRow(props) {
  return (
    <div className={styles.rowContainer}>
      {props.children}
    </div>
  )
}

export default TableRow
