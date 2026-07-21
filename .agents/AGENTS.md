# Agent Rules for Panpan

## Source Code Reference Rule
- **CRITICAL**: Every time you need to refer to source code, you MUST query Graphify first to understand the structure and relationships. Do not read codebase source files directly or run broad `grep` searches without consulting Graphify.
- Run queries using the Graphify CLI command:
  ```powershell
  & "C:\Users\SunflowerBee\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe" query "<your query>" --graph "c:\Users\SunflowerBee\Documents\Panpan\graphify-data\graphify-out\graph.json"
  ```
- To trace relationships between symbols, use `path`:
  ```powershell
  & "C:\Users\SunflowerBee\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe" path "<node1>" "<node2>" --graph "c:\Users\SunflowerBee\Documents\Panpan\graphify-data\graphify-out\graph.json"
  ```
- To explain a specific class, function, or symbol, use `explain`:
  ```powershell
  & "C:\Users\SunflowerBee\AppData\Local\Python\pythoncore-3.14-64\Scripts\graphify.exe" explain "<symbol>" --graph "c:\Users\SunflowerBee\Documents\Panpan\graphify-data\graphify-out\graph.json"
  ```
- Alternatively, you can read the pre-generated reports and visualization files:
  - Markdown Report: [GRAPH_REPORT.md](file:///c:/Users/SunflowerBee/Documents/Panpan/graphify-data/graphify-out/GRAPH_REPORT.md)
  - Interactive HTML visualization: [graph.html](file:///c:/Users/SunflowerBee/Documents/Panpan/graphify-data/graphify-out/graph.html)
