![Logo](../../admin/birthdays.png)

# ioBroker.birthdays

## Remember 1 day before birthday

```javascript
async function sendText(text) {
    // Own logic (pushover, telegram, ...)
    sendTo('pushover', 'send', {
        message: text,
        sound: '',
        title: 'Geburtstags-Kalender'
    });
}

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
