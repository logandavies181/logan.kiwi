import styles from '../styles/TableHeaderContent.module.css'

function TableHeaderContent(props) {
  return (
    <div className={styles.headerContentContainer}>
      {props.children}
    </div>
  )
}

export default TableHeaderContent
