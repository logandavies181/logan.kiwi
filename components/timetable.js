import Table from '../components/table'
import TableContent from '../components/tableContent'
import TableData from '../components/tableData'
import TableHeader from '../components/tableHeader'
import TableHeaderContent from '../components/tableHeaderContent'
import TableRow from '../components/tableRow'

function compare_times( a, b ) {
  if ( a.first_time < b.first_time ){
    return -1;
  }
  if ( a.first_time > b.first_time ){
    return 1;
  }
  return 0;
}

function TimetableComponent({boundInfo, order, stopNames}) {

  let ordered_bound = boundInfo.sort(compare_times);
  let rendered_bound = [];

  ordered_bound.forEach(item => { 
    let ordered_trip = []
    order.forEach(stop => {
      ordered_trip.push(item.times[stop]);
    })
    rendered_bound.push(ordered_trip);
  })

  return (
    <Table>
      <TableHeaderContent>
        <TableRow>
          {order.map((item) => (
            <TableHeader>{stopNames[item]}</TableHeader>
          ))}
        </TableRow>
      </TableHeaderContent>
      <TableContent>
        {rendered_bound.map((item) => (
          <TableRow>
            {item.map((trip) => (
                <TableData>{trip||"-"}</TableData>
            ))}
          </TableRow>
        ))}
      </TableContent>
    </Table>
  )
}

export default TimetableComponent
