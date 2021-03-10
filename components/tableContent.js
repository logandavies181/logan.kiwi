import styles from '../styles/TableContent.module.css'

function TableContent(props) {
  return (
    <div className={styles.tableContentContainer}>
      {props.children}
    </div>
  )
}

export default TableContent
