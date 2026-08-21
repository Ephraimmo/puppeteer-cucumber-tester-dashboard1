# Load the required assembly for SendKeys
Add-Type -AssemblyName System.Windows.Forms

# Define the username and password
$username = "karabomo@mip.co.za"
$password = "Ephraim@@217377781"

# Send the username
[System.Windows.Forms.SendKeys]::SendWait($username)
Start-Sleep -Seconds 1

# Tab to the password field
[System.Windows.Forms.SendKeys]::SendWait("{Tab}")
Start-Sleep -Seconds 1

# Send the password
[System.Windows.Forms.SendKeys]::SendWait($password)
Start-Sleep -Seconds 1

# Press Enter to submit the form
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 5

# Send the password
[System.Windows.Forms.SendKeys]::SendWait($password)
Start-Sleep -Seconds 1

# Press Enter to submit the form
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Start-Sleep -Seconds 10

# The script ends here, with no further actions
