// Get today's date in a nice format
const today = new Date();
const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
const dateString = new Intl.DateTimeFormat('en-US', options).format(today);

console.log('📅 Today is:', dateString);
console.log('\n🎯 PowerShell Tip:');
console.log(`
Use # (hashtag) as an alias for the Get-Command cmdlet.
"# Get-ChildItem"  // Lists files and directories
"# Get-Process"    // Lists running processes
"# Get-Service"    // Lists Windows services
`);