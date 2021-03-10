import styles from '../styles/TableData.module.css'

function TableData(props) {
  return (
    <div className={styles.dataContainer}>
      {props.children}
    </div>
  )
}

export default TableData
