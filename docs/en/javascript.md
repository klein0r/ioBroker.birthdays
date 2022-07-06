![Logo](../../admin/birthdays.png)

# ioBroker.birthdays

Common function to send messages / nofications

```javascript
async function sendText(text) {
    // Eigene Logik (pushover, telegram, ...)
    sendTo('pushover', 'send', {
        message: text,
        sound: '',
        title: 'Geburtstags-Kalender'
    });
}
```

## Remember 1 day before birthday

```javascript
schedule('0 7 * * *', async () => {
    const nextDaysLeft = getState('birthdays.0.next.daysLeft').val;
    const nextText = getState('birthdays.0.next.text').val;

    const nextAfterDaysLeft = getState('birthdays.0.nextAfter.daysLeft').val;
    const nextAfterText = getState('birthdays.0.nextAfter.text').val;

    // Birthday today
    if (nextDaysLeft == 0) {
        await sendText(`Geburtstage heute: ${nextText}`);

        // If tomorrow is also a birthday
        if (nextAfterDaysLeft == 1) {
            await sendText(`Geburtstage morgen: ${nextAfterText}`);
        }
    } else if (nextDaysLeft == 1) {
        await sendText(`Geburtstage morgen: ${nextText}`);
    }
});
```

## Reminder of birthdays in the upcoming week

```javascript
// Run script at the beginning of the week
schedule('0 7 * * 1', async () => {
    const summaryObj = JSON.parse(getState('birthdays.0.summary.json').val);

    const nextBirthdays = summaryObj
        .filter(b => b.daysLeft < 7)
        .map(b => `${b.name} turns ${b.age} on ${formatDate(new Date(b._nextBirthday), 'WW')}`);

    if (nextBirthdays.length > 0) {
        await sendText(`Birthdays this week: ${nextBirthdays.join(', ')}`);
    }
});
```
