# IKIRERE 🌦️
A Node.js Command-Line Weather Forecasting Tool

**Ikirere** is a Kinyarwanda word meaning *weather*.

Ikirere is a Node.js command-line application that allows users to retrieve current weather conditions and forecasts by entering a city name. It uses geocoding to convert city names into geographical coordinates and then retrieves weather information using the free [Open-Meteo APIs](https://open-meteo.com/).

The application does not require an API key.


1. Example Output

When a user runs the command `ikirere Kigali`, the application displays current weather conditions and a forecast.


$ ikirere Kigali

Kigali, Rwanda
Kigali City · -1.95°, 30.06° · 1567 m elevation · Africa/Kigali

⛅ 22°C  Partly cloudy (feels like 22°C, daytime)

Humidity 60% · Cloud cover 40% · Pressure 1015 hPa · Rain now 0 mm
Wind 8.3 km/h from NE (gusts 15.1 km/h)
Sunrise 05:48 · Sunset 17:51 · UV index today 11

Sat 07 Nov  ⛅ Partly cloudy  14° / 26°  rain 0 mm (20%)  wind 12 km/h  UV 11
Sun 08 Nov  🌧️ Light rain     15° / 25°  rain 4.2 mm (70%)  wind 15 km/h  UV 9
Mon 09 Nov  ⛈️ Thunderstorm   15° / 23°  rain 12.5 mm (90%) wind 23 km/h UV 7


*Note: This is example output. Actual weather values will vary depending on the location and time of the request.*


2. Installation

 2.1 Requirements

Before installing Ikirere, ensure that your computer has:

- Node.js version 18.17 or later.
- npm (Node Package Manager).
- Git.

2.2 Clone the repository

Run the following commands in your terminal:


git clone https://github.com/<your-username>/ikirere.git
cd ikirere

 2.3 Install dependencies

Install the required Axios package:


npm install


2.4 Install the command globally


npm install -g .


After installation, the `ikirere` command will be available from your terminal.

Verify the installation:


ikirere --help


**Alternative for development**

If you are developing the application locally, use:


npm link


To uninstall the globally installed application:


npm uninstall -g ikirere



3. Usage and Available Commands

Ikirere provides several commands for retrieving weather information, managing favourite cities, viewing search history, and configuring application settings.

3.1 Main Commands

| Command | Description |
|---|---|
| `ikirere <city>` | Displays current weather and forecast for a specified city. |
| `ikirere` | Displays weather for the configured default city. |
| `ikirere fav add <city>` | Adds a city to favourites. |
| `ikirere fav remove <city>` | Removes a city from favourites. |
| `ikirere fav list` | Displays all favourite cities. |
| `ikirere fav weather` | Retrieves weather for all favourite cities. |
| `ikirere history` | Displays the last 50 searches. |
| `ikirere history --clear` | Clears search history. |
| `ikirere config` | Displays application settings and data file location. |
| `ikirere config set units <metric\|imperial>` | Changes the preferred measurement system. |
| `ikirere config set default-city <city>` | Sets the default city. |

3.2 Available Options

| Option | Description |
|---|---|
| `-d, --days <1-16>` | Specifies the number of forecast days. Default: 3. |
| `-u, --units <metric\|imperial>` | Selects the measurement system. |
| `--json` | Displays the raw JSON response. |
| `--no-history` | Prevents the current search from being saved. |
| `-h, --help` | Displays the help information. |
| `-v, --version` | Displays the application version. |

**Examples:**


ikirere Kigali
ikirere "New York" --days 5
ikirere "New York" --days 5 --units imperial
ikirere Kigali --json




4. Configuration

Ikirere supports environment variables that allow users to customize application behaviour.

| Environment Variable | Default Value | Description |
|---|---|---|
| `IKIRERE_HOME` | `~/.ikirere` | Specifies the directory containing `data.json`. |
| `IKIRERE_UNITS` | Saved setting | Defines the preferred measurement system: `metric` or `imperial`. |
| `IKIRERE_TIMEOUT_MS` | `8000` | Sets the request timeout in milliseconds. |
| `IKIRERE_GEOCODING_URL` | Open-Meteo | Overrides the geocoding API URL. |
| `IKIRERE_FORECAST_URL` | Open-Meteo | Overrides the forecast API URL. |
| `NO_COLOR` | Unset | Disables terminal colours when configured. |

Configuration Priority

When determining the measurement system, Ikirere follows this priority:

1. Command-line option (`--units`).
2. Environment variable (`IKIRERE_UNITS`).
3. Saved configuration setting.

The command-line option has the highest priority.


5. Exit Codes and Error Handling

Ikirere uses exit codes to indicate whether a command executed successfully or encountered an error.

Errors are displayed through standard error (`stderr`), while successful results are displayed through standard output (`stdout`).

| Exit Code | Meaning | Possible Cause |
|---|---|---|
| `0` | Success | Command completed successfully. |
| `1` | Unexpected error | Corrupt or unwritable `data.json`. |
| `2` | Bad input | Unknown flag, invalid forecast days, empty city, or invalid environment variable; HTTP 400/422. |
| `3` | Not found | Unknown city or HTTP 404. |
| `4` | Network error | Offline connection, DNS failure, or connection refused. |
| `5` | Timeout | Request timeout or HTTP 408/504. |
| `6` | Service error | HTTP 401/403, server errors (5xx), or unreadable response. |
| `7` | Rate limited | HTTP 429. |

### Example: Handling an Unknown City


$ ikirere Xyzzyville

Error: Could not find a place called "Xyzzyville".
Check the spelling, or try a nearby larger city.

To check the exit code:


Expected output:


3



6. Application Walkthrough

 6.1 Retrieve Weather Information

Ikirere performs two API requests to retrieve weather information.

First request: Geocoding**

The application sends the city name to the Open-Meteo Geocoding API, which returns geographical information such as:

- City name.
- Country.
- Latitude.
- Longitude.
- Elevation.
- Time zone.

Second request: Weather Forecast**

The application uses the returned latitude and longitude to request current weather conditions and forecast information from the Open-Meteo Forecast API.

Example:


ikirere Kigali
ikirere "New York" --days 5 --units imperial

 6.2 Manage Favourite Cities and Search History

Users can save their favourite cities and retrieve their weather information whenever needed.

**Add a favourite city:**


ikirere fav add Kigali


Example output:


Added Kigali, Rwanda to favourites.


**Display favourite cities:**


ikirere fav list


Example output:


1. Kigali, Rwanda


**Retrieve weather for favourite cities:**


ikirere fav weather

**View recent searches:**


ikirere history


Example output:


2026-11-07 13:46  Kigali, Rwanda


Both favourites and search history are stored in:


~/.ikirere/data.json

6.3 Change Application Settings

Users can customize the application by setting a default city or changing the measurement system.

**Set the default city:**


ikirere config set default-city Kigali


Example output

Saved default-city = Kigali


After setting the default city, users can retrieve its weather without entering the city name:


ikirere

**Change measurement units:**


ikirere config set units imperial




7. Using Ikirere in Scripts

Ikirere can also be integrated into shell scripts and other command-line workflows.

For example, users can save weather information in JSON format:


ikirere Kigali --json > kigali.json or echo "failed with code $?"


This command retrieves the weather information in JSON format and saves it to `kigali.json`.

If the command fails, an error message is displayed.



8. Project Architecture and File Structure

The application is organized into separate files, with each file responsible for a specific function.

| File | Responsibility |
|---|---|
| `bin/ikirere.js` | Application entry point. Calls `main()` and sets `process.exitCode`. |
| `src/cli.js` | Handles command-line arguments using `util.parseArgs`, command routing, and error-to-exit-code handling. |
| `src/api.js` | Handles the two chained Axios API requests, request timeouts, and error translation. |
| `src/store.js` | Manages favourites, search history, and settings using `fs/promises` and `path`. |
| `src/config.js` | Reads environment variables and manages configuration using `os.homedir()`. |
| `src/format.js` | Formats weather information for terminal display. |
| `src/errors.js` | Defines `IkirereError`, exit codes, and HTTP status mapping. |
| `test/cli.test.js` | Contains CLI tests using a local fake weather server without requiring internet access. |

8.1 How the Application Works

The main execution process follows these steps:

1. The user enters a command in the terminal.
2. The entry-point file (`bin/ikirere.js`) starts the application.
3. The CLI module (`src/cli.js`) processes the command and its arguments.
4. The API module (`src/api.js`) retrieves location and weather information.
5. The configuration module (`src/config.js`) provides application settings.
6. The formatting module (`src/format.js`) prepares the results for display.
7. The storage module (`src/store.js`) saves favourites, history, and settings when necessary.
8. The error module (`src/errors.js`) handles errors and assigns the appropriate exit code.

8.2 Testing

The application includes automated tests for command-line functionality.

Run the tests using:


npm test


The tests use a local fake weather server, allowing them to run without making real internet requests.



9. License and Data Attribution

**Project License:** MIT License.

**Weather Data Provider:** [Open-Meteo](https://open-meteo.com/).

Weather data provided by Open-Meteo is licensed under **Creative Commons Attribution 4.0 International (CC BY 4.0)**.



10. Conclusion

Ikirere is a Node.js command-line weather application designed to make weather information accessible directly from the terminal.

By combining geocoding, weather forecasting, command-line functionality, persistent storage, and error handling, the application provides users with a convenient way to retrieve and manage weather information.

Its modular architecture also makes the application easier to maintain, test, and extend in the future.
