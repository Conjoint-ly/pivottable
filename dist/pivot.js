(function() {
  var callWithJQuery,
    indexOf = [].indexOf,
    hasProp = {}.hasOwnProperty;

  callWithJQuery = function(pivotModule) {
    if (typeof exports === "object" && typeof module === "object") { // CommonJS
      return pivotModule(require("jquery"));
    } else if (typeof define === "function" && define.amd) { // AMD
      return define(["jquery"], pivotModule);
    } else {
      // Plain browser env
      return pivotModule(jQuery);
    }
  };

  callWithJQuery(function($) {
    /*
    Utilities
    */
    /*
    Default Renderer for hierarchical table layout
    */
    /*
    Async Pivot Table renderer with progress callbacks
    */
    /*
    Virtualized Pivot Table Renderer - оптимизированная версия для больших данных
    */
    var PivotData, addSeparators, aggregatorTemplates, aggregators, dayNamesEn, derivers, getSort, locales, mthNamesEn, naturalSort, numberFormat, pivotTableRenderer, pivotTableRendererAsync, pivotTableRendererVirtualized, rd, renderers, rx, rz, sortAs, usFmt, usFmtInt, usFmtPct, zeroPad;
    addSeparators = function(nStr, thousandsSep, decimalSep) {
      var rgx, x, x1, x2;
      nStr += '';
      x = nStr.split('.');
      x1 = x[0];
      x2 = x.length > 1 ? decimalSep + x[1] : '';
      rgx = /(\d+)(\d{3})/;
      while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + thousandsSep + '$2');
      }
      return x1 + x2;
    };
    numberFormat = function(opts) {
      var defaults;
      defaults = {
        digitsAfterDecimal: 2,
        scaler: 1,
        thousandsSep: ",",
        decimalSep: ".",
        prefix: "",
        suffix: ""
      };
      opts = $.extend({}, defaults, opts);
      return function(x) {
        var result;
        if (isNaN(x) || !isFinite(x)) {
          return "";
        }
        result = addSeparators((opts.scaler * x).toFixed(opts.digitsAfterDecimal), opts.thousandsSep, opts.decimalSep);
        return "" + opts.prefix + result + opts.suffix;
      };
    };
    //aggregator templates default to US number formatting but this is overrideable
    usFmt = numberFormat();
    usFmtInt = numberFormat({
      digitsAfterDecimal: 0
    });
    usFmtPct = numberFormat({
      digitsAfterDecimal: 1,
      scaler: 100,
      suffix: "%"
    });
    aggregatorTemplates = {
      count: function(formatter = usFmtInt) {
        return function() {
          return function(data, rowKey, colKey) {
            return {
              count: 0,
              push: function() {
                return this.count++;
              },
              value: function() {
                return this.count;
              },
              format: formatter
            };
          };
        };
      },
      uniques: function(fn, formatter = usFmtInt) {
        return function([attr]) {
          return function(data, rowKey, colKey) {
            return {
              uniq: [],
              push: function(record) {
                var ref;
                if (ref = record[attr], indexOf.call(this.uniq, ref) < 0) {
                  return this.uniq.push(record[attr]);
                }
              },
              value: function() {
                return fn(this.uniq);
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      sum: function(formatter = usFmt) {
        return function([attr]) {
          return function(data, rowKey, colKey) {
            return {
              sum: 0,
              push: function(record) {
                if (!isNaN(parseFloat(record[attr]))) {
                  return this.sum += parseFloat(record[attr]);
                }
              },
              value: function() {
                return this.sum;
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      extremes: function(mode, formatter = usFmt) {
        return function([attr]) {
          return function(data, rowKey, colKey) {
            return {
              val: null,
              sorter: getSort(data != null ? data.sorters : void 0, attr),
              push: function(record) {
                var ref, ref1, ref2, x;
                x = record[attr];
                if (mode === "min" || mode === "max") {
                  x = parseFloat(x);
                  if (!isNaN(x)) {
                    this.val = Math[mode](x, (ref = this.val) != null ? ref : x);
                  }
                }
                if (mode === "first") {
                  if (this.sorter(x, (ref1 = this.val) != null ? ref1 : x) <= 0) {
                    this.val = x;
                  }
                }
                if (mode === "last") {
                  if (this.sorter(x, (ref2 = this.val) != null ? ref2 : x) >= 0) {
                    return this.val = x;
                  }
                }
              },
              value: function() {
                return this.val;
              },
              format: function(x) {
                if (isNaN(x)) {
                  return x;
                } else {
                  return formatter(x);
                }
              },
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      quantile: function(q, formatter = usFmt) {
        return function([attr]) {
          return function(data, rowKey, colKey) {
            return {
              vals: [],
              push: function(record) {
                var x;
                x = parseFloat(record[attr]);
                if (!isNaN(x)) {
                  return this.vals.push(x);
                }
              },
              value: function() {
                var i;
                if (this.vals.length === 0) {
                  return null;
                }
                this.vals.sort(function(a, b) {
                  return a - b;
                });
                i = (this.vals.length - 1) * q;
                return (this.vals[Math.floor(i)] + this.vals[Math.ceil(i)]) / 2.0;
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      runningStat: function(mode = "mean", ddof = 1, formatter = usFmt) {
        return function([attr]) {
          return function(data, rowKey, colKey) {
            return {
              n: 0.0,
              m: 0.0,
              s: 0.0,
              push: function(record) {
                var m_new, x;
                x = parseFloat(record[attr]);
                if (isNaN(x)) {
                  return;
                }
                this.n += 1.0;
                if (this.n === 1.0) {
                  return this.m = x;
                } else {
                  m_new = this.m + (x - this.m) / this.n;
                  this.s = this.s + (x - this.m) * (x - m_new);
                  return this.m = m_new;
                }
              },
              value: function() {
                if (mode === "mean") {
                  if (this.n === 0) {
                    return 0 / 0;
                  } else {
                    return this.m;
                  }
                }
                if (this.n <= ddof) {
                  return 0;
                }
                switch (mode) {
                  case "var":
                    return this.s / (this.n - ddof);
                  case "stdev":
                    return Math.sqrt(this.s / (this.n - ddof));
                }
              },
              format: formatter,
              numInputs: attr != null ? 0 : 1
            };
          };
        };
      },
      sumOverSum: function(formatter = usFmt) {
        return function([num, denom]) {
          return function(data, rowKey, colKey) {
            return {
              sumNum: 0,
              sumDenom: 0,
              push: function(record) {
                if (!isNaN(parseFloat(record[num]))) {
                  this.sumNum += parseFloat(record[num]);
                }
                if (!isNaN(parseFloat(record[denom]))) {
                  return this.sumDenom += parseFloat(record[denom]);
                }
              },
              value: function() {
                return this.sumNum / this.sumDenom;
              },
              format: formatter,
              numInputs: (num != null) && (denom != null) ? 0 : 2
            };
          };
        };
      },
      sumOverSumBound80: function(upper = true, formatter = usFmt) {
        return function([num, denom]) {
          return function(data, rowKey, colKey) {
            return {
              sumNum: 0,
              sumDenom: 0,
              push: function(record) {
                if (!isNaN(parseFloat(record[num]))) {
                  this.sumNum += parseFloat(record[num]);
                }
                if (!isNaN(parseFloat(record[denom]))) {
                  return this.sumDenom += parseFloat(record[denom]);
                }
              },
              value: function() {
                var sign;
                sign = upper ? 1 : -1;
                return (0.821187207574908 / this.sumDenom + this.sumNum / this.sumDenom + 1.2815515655446004 * sign * Math.sqrt(0.410593603787454 / (this.sumDenom * this.sumDenom) + (this.sumNum * (1 - this.sumNum / this.sumDenom)) / (this.sumDenom * this.sumDenom))) / (1 + 1.642374415149816 / this.sumDenom);
              },
              format: formatter,
              numInputs: (num != null) && (denom != null) ? 0 : 2
            };
          };
        };
      },
      fractionOf: function(wrapped, type = "total", formatter = usFmtPct) {
        return function(...x) {
          return function(data, rowKey, colKey) {
            return {
              selector: {
                total: [[], []],
                row: [rowKey, []],
                col: [[], colKey]
              }[type],
              inner: wrapped(...x)(data, rowKey, colKey),
              push: function(record) {
                return this.inner.push(record);
              },
              format: formatter,
              value: function() {
                return this.inner.value() / data.getAggregator(...this.selector).inner.value();
              },
              numInputs: wrapped(...x)().numInputs
            };
          };
        };
      }
    };
    aggregatorTemplates.countUnique = function(f) {
      return aggregatorTemplates.uniques((function(x) {
        return x.length;
      }), f);
    };
    aggregatorTemplates.listUnique = function(s) {
      return aggregatorTemplates.uniques((function(x) {
        return x.sort(naturalSort).join(s);
      }), (function(x) {
        return x;
      }));
    };
    aggregatorTemplates.max = function(f) {
      return aggregatorTemplates.extremes('max', f);
    };
    aggregatorTemplates.min = function(f) {
      return aggregatorTemplates.extremes('min', f);
    };
    aggregatorTemplates.first = function(f) {
      return aggregatorTemplates.extremes('first', f);
    };
    aggregatorTemplates.last = function(f) {
      return aggregatorTemplates.extremes('last', f);
    };
    aggregatorTemplates.median = function(f) {
      return aggregatorTemplates.quantile(0.5, f);
    };
    aggregatorTemplates.average = function(f) {
      return aggregatorTemplates.runningStat("mean", 1, f);
    };
    aggregatorTemplates.var = function(ddof, f) {
      return aggregatorTemplates.runningStat("var", ddof, f);
    };
    aggregatorTemplates.stdev = function(ddof, f) {
      return aggregatorTemplates.runningStat("stdev", ddof, f);
    };
    //default aggregators & renderers use US naming and number formatting
    aggregators = (function(tpl) {
      return {
        "Count": tpl.count(usFmtInt),
        "Count Unique Values": tpl.countUnique(usFmtInt),
        "List Unique Values": tpl.listUnique(", "),
        "Sum": tpl.sum(usFmt),
        "Integer Sum": tpl.sum(usFmtInt),
        "Average": tpl.average(usFmt),
        "Median": tpl.median(usFmt),
        "Sample Variance": tpl.var(1, usFmt),
        "Sample Standard Deviation": tpl.stdev(1, usFmt),
        "Minimum": tpl.min(usFmt),
        "Maximum": tpl.max(usFmt),
        "First": tpl.first(usFmt),
        "Last": tpl.last(usFmt),
        "Sum over Sum": tpl.sumOverSum(usFmt),
        "80% Upper Bound": tpl.sumOverSumBound80(true, usFmt),
        "80% Lower Bound": tpl.sumOverSumBound80(false, usFmt),
        "Sum as Fraction of Total": tpl.fractionOf(tpl.sum(), "total", usFmtPct),
        "Sum as Fraction of Rows": tpl.fractionOf(tpl.sum(), "row", usFmtPct),
        "Sum as Fraction of Columns": tpl.fractionOf(tpl.sum(), "col", usFmtPct),
        "Count as Fraction of Total": tpl.fractionOf(tpl.count(), "total", usFmtPct),
        "Count as Fraction of Rows": tpl.fractionOf(tpl.count(), "row", usFmtPct),
        "Count as Fraction of Columns": tpl.fractionOf(tpl.count(), "col", usFmtPct)
      };
    })(aggregatorTemplates);
    renderers = {
      "Table": function(data, opts) {
        return pivotTableRendererVirtualized(data, opts);
      },
      "Table Barchart": function(data, opts) {
        return $(pivotTableRenderer(data, opts)).barchart();
      },
      "Heatmap": function(data, opts) {
        return $(pivotTableRenderer(data, opts)).heatmap("heatmap", opts);
      },
      "Row Heatmap": function(data, opts) {
        return $(pivotTableRenderer(data, opts)).heatmap("rowheatmap", opts);
      },
      "Col Heatmap": function(data, opts) {
        return $(pivotTableRenderer(data, opts)).heatmap("colheatmap", opts);
      }
    };
    locales = {
      en: {
        aggregators: aggregators,
        renderers: renderers,
        localeStrings: {
          renderError: "An error occurred rendering the PivotTable results.",
          computeError: "An error occurred computing the PivotTable results.",
          uiRenderError: "An error occurred rendering the PivotTable UI.",
          selectAll: "Select All",
          selectNone: "Select None",
          tooMany: "(too many to list)",
          filterResults: "Filter values",
          apply: "Apply",
          cancel: "Cancel",
          totals: "Totals", //for table renderer
          vs: "vs", //for gchart renderer
          by: "by" //for gchart renderer
        }
      }
    };
    
    //dateFormat deriver l10n requires month and day names to be passed in directly
    mthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    dayNamesEn = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    zeroPad = function(number) {
      return ("0" + number).substr(-2, 2);
    };
    derivers = {
      bin: function(col, binWidth) {
        return function(record) {
          return record[col] - record[col] % binWidth;
        };
      },
      dateFormat: function(col, formatString, utcOutput = false, mthNames = mthNamesEn, dayNames = dayNamesEn) {
        var utc;
        utc = utcOutput ? "UTC" : "";
        return function(record) { //thanks http://stackoverflow.com/a/12213072/112871
          var date;
          date = new Date(Date.parse(record[col]));
          if (isNaN(date)) {
            return "";
          }
          return formatString.replace(/%(.)/g, function(m, p) {
            switch (p) {
              case "y":
                return date[`get${utc}FullYear`]();
              case "m":
                return zeroPad(date[`get${utc}Month`]() + 1);
              case "n":
                return mthNames[date[`get${utc}Month`]()];
              case "d":
                return zeroPad(date[`get${utc}Date`]());
              case "w":
                return dayNames[date[`get${utc}Day`]()];
              case "x":
                return date[`get${utc}Day`]();
              case "H":
                return zeroPad(date[`get${utc}Hours`]());
              case "M":
                return zeroPad(date[`get${utc}Minutes`]());
              case "S":
                return zeroPad(date[`get${utc}Seconds`]());
              default:
                return "%" + p;
            }
          });
        };
      }
    };
    rx = /(\d+)|(\D+)/g;
    rd = /\d/;
    rz = /^0/;
    naturalSort = (as, bs) => {
      var a, a1, b, b1, nas, nbs;
      if ((bs != null) && (as == null)) {
        //nulls first
        return -1;
      }
      if ((as != null) && (bs == null)) {
        return 1;
      }
      if (typeof as === "number" && isNaN(as)) {
        //then raw NaNs
        return -1;
      }
      if (typeof bs === "number" && isNaN(bs)) {
        return 1;
      }
      //numbers and numbery strings group together
      nas = +as;
      nbs = +bs;
      if (nas < nbs) {
        return -1;
      }
      if (nas > nbs) {
        return 1;
      }
      if (typeof as === "number" && typeof bs !== "number") {
        //within that, true numbers before numbery strings
        return -1;
      }
      if (typeof bs === "number" && typeof as !== "number") {
        return 1;
      }
      if (typeof as === "number" && typeof bs === "number") {
        return 0;
      }
      if (isNaN(nbs) && !isNaN(nas)) {
        // 'Infinity' is a textual number, so less than 'A'
        return -1;
      }
      if (isNaN(nas) && !isNaN(nbs)) {
        return 1;
      }
      //finally, "smart" string sorting per http://stackoverflow.com/a/4373421/112871
      a = String(as);
      b = String(bs);
      if (a === b) {
        return 0;
      }
      if (!(rd.test(a) && rd.test(b))) {
        return (a > b ? 1 : -1);
      }
      //special treatment for strings containing digits
      a = a.match(rx); //create digits vs non-digit chunks and iterate through
      b = b.match(rx);
      while (a.length && b.length) {
        a1 = a.shift();
        b1 = b.shift();
        if (a1 !== b1) {
          if (rd.test(a1) && rd.test(b1)) { //both are digit chunks
            return a1.replace(rz, ".0") - b1.replace(rz, ".0");
          } else {
            return (a1 > b1 ? 1 : -1);
          }
        }
      }
      return a.length - b.length;
    };
    sortAs = function(order) {
      var i, l_mapping, mapping, x;
      mapping = {};
      l_mapping = {}; // sort lowercased keys similarly
      for (i in order) {
        x = order[i];
        mapping[x] = i;
        if (typeof x === "string") {
          l_mapping[x.toLowerCase()] = i;
        }
      }
      return function(a, b) {
        if ((mapping[a] != null) && (mapping[b] != null)) {
          return mapping[a] - mapping[b];
        } else if (mapping[a] != null) {
          return -1;
        } else if (mapping[b] != null) {
          return 1;
        } else if ((l_mapping[a] != null) && (l_mapping[b] != null)) {
          return l_mapping[a] - l_mapping[b];
        } else if (l_mapping[a] != null) {
          return -1;
        } else if (l_mapping[b] != null) {
          return 1;
        } else {
          return naturalSort(a, b);
        }
      };
    };
    getSort = function(sorters, attr) {
      var sort;
      if (sorters != null) {
        if ($.isFunction(sorters)) {
          sort = sorters(attr);
          if ($.isFunction(sort)) {
            return sort;
          }
        } else if (sorters[attr] != null) {
          return sorters[attr];
        }
      }
      return naturalSort;
    };
    /*
    Data Model class
    */
    PivotData = class PivotData {
      constructor(input, opts = {}) {
        var ref, ref1, ref10, ref11, ref12, ref2, ref3, ref4, ref5, ref6, ref7, ref8, ref9;
        this.arrSort = this.arrSort.bind(this);
        this.sortKeys = this.sortKeys.bind(this);
        this.getColKeys = this.getColKeys.bind(this);
        this.getRowKeys = this.getRowKeys.bind(this);
        this.getAggregator = this.getAggregator.bind(this);
        // Async data processing methods
        this.abort = this.abort.bind(this);
        this.callLifecycleCallback = this.callLifecycleCallback.bind(this);
        this.countTotalRecords = this.countTotalRecords.bind(this);
        this.processDataAsync = this.processDataAsync.bind(this);
        this.processRecordsAsync = this.processRecordsAsync.bind(this);
        this.processRecordsBatch = this.processRecordsBatch.bind(this);
        this.input = input;
        this.aggregator = (ref = opts.aggregator) != null ? ref : aggregatorTemplates.count()();
        this.aggregatorName = (ref1 = opts.aggregatorName) != null ? ref1 : "Count";
        this.colAttrs = (ref2 = opts.cols) != null ? ref2 : [];
        this.rowAttrs = (ref3 = opts.rows) != null ? ref3 : [];
        this.valAttrs = (ref4 = opts.vals) != null ? ref4 : [];
        this.sorters = (ref5 = opts.sorters) != null ? ref5 : {};
        this.rowOrder = (ref6 = opts.rowOrder) != null ? ref6 : "key_a_to_z";
        this.colOrder = (ref7 = opts.colOrder) != null ? ref7 : "key_a_to_z";
        this.derivedAttributes = (ref8 = opts.derivedAttributes) != null ? ref8 : {};
        this.filter = (ref9 = opts.filter) != null ? ref9 : (function() {
          return true;
        });
        this.tree = {};
        this.rowKeys = [];
        this.colKeys = [];
        this.rowTotals = {};
        this.colTotals = {};
        this.allTotal = this.aggregator(this, [], []);
        this.sorted = false;
        // Async options
        this.asyncMode = (ref10 = opts.asyncMode) != null ? ref10 : false;
        this.lifecycleCallback = (ref11 = opts.rendererOptions.lifecycleCallback) != null ? ref11 : null;
        this.progressInterval = (ref12 = opts.rendererOptions.progressInterval) != null ? ref12 : 1000;
        this.aborted = false;
        this.startTime = null;
        this.processedRecords = 0;
        this.totalRecords = 0;
        this.dataReady = !this.asyncMode; // true for sync, false for async until processing completes
        
        // iterate through input, accumulating data for cells
        if (this.asyncMode) {
          this.processDataAsync();
        } else {
          PivotData.forEachRecord(this.input, this.derivedAttributes, (record) => {
            if (this.filter(record)) {
              return this.processRecord(record);
            }
          });
        }
      }

      //can handle arrays or jQuery selections of tables
      static forEachRecord(input, derivedAttributes, f) {
        var addRecord, compactRecord, i, j, k, l, len1, record, ref, results, results1, tblCols;
        if ($.isEmptyObject(derivedAttributes)) {
          addRecord = f;
        } else {
          addRecord = function(record) {
            var k, ref, v;
            for (k in derivedAttributes) {
              v = derivedAttributes[k];
              record[k] = (ref = v(record)) != null ? ref : record[k];
            }
            return f(record);
          };
        }
        //if it's a function, have it call us back
        if ($.isFunction(input)) {
          return input(addRecord);
        } else if ($.isArray(input)) {
          if ($.isArray(input[0])) {
            results = [];
            for (i in input) {
              if (!hasProp.call(input, i)) continue;
              compactRecord = input[i];
              if (!(i > 0)) {
                continue;
              }
              record = {};
              ref = input[0];
              for (j in ref) {
                if (!hasProp.call(ref, j)) continue;
                k = ref[j];
                record[k] = compactRecord[j];
              }
              results.push(addRecord(record)); //array of objects
            }
            return results;
          } else {
            results1 = [];
            for (l = 0, len1 = input.length; l < len1; l++) {
              record = input[l];
              results1.push(addRecord(record));
            }
            return results1;
          }
        } else if (input instanceof $) {
          tblCols = [];
          $("thead > tr > th", input).each(function(i) {
            return tblCols.push($(this).text());
          });
          return $("tbody > tr", input).each(function(i) {
            record = {};
            $("td", this).each(function(j) {
              return record[tblCols[j]] = $(this).text();
            });
            return addRecord(record);
          });
        } else {
          throw new Error("unknown input format");
        }
      }

      forEachMatchingRecord(criteria, callback) {
        return PivotData.forEachRecord(this.input, this.derivedAttributes, (record) => {
          var k, ref, v;
          if (!this.filter(record)) {
            return;
          }
          for (k in criteria) {
            v = criteria[k];
            if (v !== ((ref = record[k]) != null ? ref : "null")) {
              return;
            }
          }
          return callback(record);
        });
      }

      arrSort(attrs) {
        var a, sortersArr;
        sortersArr = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = attrs.length; l < len1; l++) {
            a = attrs[l];
            results.push(getSort(this.sorters, a));
          }
          return results;
        }).call(this);
        return function(a, b) {
          var comparison, i, sorter;
          for (i in sortersArr) {
            if (!hasProp.call(sortersArr, i)) continue;
            sorter = sortersArr[i];
            comparison = sorter(a[i], b[i]);
            if (comparison !== 0) {
              return comparison;
            }
          }
          return 0;
        };
      }

      sortKeys() {
        var v;
        if (!this.sorted) {
          this.sorted = true;
          v = (r, c) => {
            return this.getAggregator(r, c).value();
          };
          switch (this.rowOrder) {
            case "value_a_to_z":
              this.rowKeys.sort((a, b) => {
                return naturalSort(v(a, []), v(b, []));
              });
              break;
            case "value_z_to_a":
              this.rowKeys.sort((a, b) => {
                return -naturalSort(v(a, []), v(b, []));
              });
              break;
            default:
              this.rowKeys.sort(this.arrSort(this.rowAttrs));
          }
          switch (this.colOrder) {
            case "value_a_to_z":
              return this.colKeys.sort((a, b) => {
                return naturalSort(v([], a), v([], b));
              });
            case "value_z_to_a":
              return this.colKeys.sort((a, b) => {
                return -naturalSort(v([], a), v([], b));
              });
            default:
              return this.colKeys.sort(this.arrSort(this.colAttrs));
          }
        }
      }

      getColKeys() {
        this.sortKeys();
        return this.colKeys;
      }

      getRowKeys() {
        this.sortKeys();
        return this.rowKeys;
      }

      processRecord(record) { //this code is called in a tight loop
        var colKey, flatColKey, flatRowKey, l, len1, len2, n, ref, ref1, ref2, ref3, rowKey, x;
        colKey = [];
        rowKey = [];
        ref = this.colAttrs;
        for (l = 0, len1 = ref.length; l < len1; l++) {
          x = ref[l];
          colKey.push((ref1 = record[x]) != null ? ref1 : "null");
        }
        ref2 = this.rowAttrs;
        for (n = 0, len2 = ref2.length; n < len2; n++) {
          x = ref2[n];
          rowKey.push((ref3 = record[x]) != null ? ref3 : "null");
        }
        flatRowKey = rowKey.join(String.fromCharCode(0));
        flatColKey = colKey.join(String.fromCharCode(0));
        this.allTotal.push(record);
        if (rowKey.length !== 0) {
          if (!this.rowTotals[flatRowKey]) {
            this.rowKeys.push(rowKey);
            this.rowTotals[flatRowKey] = this.aggregator(this, rowKey, []);
          }
          this.rowTotals[flatRowKey].push(record);
        }
        if (colKey.length !== 0) {
          if (!this.colTotals[flatColKey]) {
            this.colKeys.push(colKey);
            this.colTotals[flatColKey] = this.aggregator(this, [], colKey);
          }
          this.colTotals[flatColKey].push(record);
        }
        if (colKey.length !== 0 && rowKey.length !== 0) {
          if (!this.tree[flatRowKey]) {
            this.tree[flatRowKey] = {};
          }
          if (!this.tree[flatRowKey][flatColKey]) {
            this.tree[flatRowKey][flatColKey] = this.aggregator(this, rowKey, colKey);
          }
          return this.tree[flatRowKey][flatColKey].push(record);
        }
      }

      getAggregator(rowKey, colKey) {
        var agg, flatColKey, flatRowKey;
        flatRowKey = rowKey.join(String.fromCharCode(0));
        flatColKey = colKey.join(String.fromCharCode(0));
        if (rowKey.length === 0 && colKey.length === 0) {
          agg = this.allTotal;
        } else if (rowKey.length === 0) {
          agg = this.colTotals[flatColKey];
        } else if (colKey.length === 0) {
          agg = this.rowTotals[flatRowKey];
        } else {
          agg = this.tree[flatRowKey][flatColKey];
        }
        return agg != null ? agg : {
          value: (function() {
            return null;
          }),
          format: function() {
            return "";
          }
        };
      }

      abort() {
        return this.aborted = true;
      }

      callLifecycleCallback(stage) {
        var abortFn, elapsedTime, metadata, progress, toggleVirtualizationFn;
        if (this.lifecycleCallback == null) {
          return;
        }
        elapsedTime = this.startTime ? Date.now() - this.startTime : 0;
        progress = this.totalRecords > 0 ? Math.round((this.processedRecords / this.totalRecords) * 100) : 0;
        metadata = {
          stage: stage,
          progress: progress,
          elapsedTime: elapsedTime,
          totalRows: this.totalRecords,
          currentIndex: this.processedRecords
        };
        abortFn = null;
        if (stage === 'data-started' || stage === 'data-progress') {
          abortFn = () => {
            return this.abort();
          };
        }
        toggleVirtualizationFn = null;
        return this.lifecycleCallback(metadata, abortFn, toggleVirtualizationFn);
      }

      countTotalRecords() {
        var count;
        count = 0;
        PivotData.forEachRecord(this.input, this.derivedAttributes, (record) => {
          if (this.filter(record)) {
            return count++;
          }
        });
        return this.totalRecords = count;
      }

      processDataAsync() {
        this.startTime = Date.now();
        this.aborted = false;
        // First count total records for progress tracking
        return setTimeout(() => {
          this.countTotalRecords();
          this.callLifecycleCallback('data-started');
          return this.processRecordsAsync();
        }, 0);
      }

      processRecordsAsync() {
        var records;
        records = [];
        // Collect all records first
        PivotData.forEachRecord(this.input, this.derivedAttributes, (record) => {
          if (this.filter(record)) {
            return records.push(record);
          }
        });
        this.totalRecords = records.length; // Set total records here
        return this.processRecordsBatch(records, 0);
      }

      processRecordsBatch(records, startIndex) {
        var batchSize, endIndex, i, l, record, ref, ref1;
        if (this.aborted) {
          return;
        }
        batchSize = Math.min(this.progressInterval, records.length - startIndex);
        endIndex = startIndex + batchSize;
// Process batch
        for (i = l = ref = startIndex, ref1 = endIndex; (ref <= ref1 ? l < ref1 : l > ref1); i = ref <= ref1 ? ++l : --l) {
          record = records[i];
          this.processRecord(record);
          this.processedRecords++;
          this.callLifecycleCallback('data-progress');
        }
        if (endIndex < records.length) {
          // Continue with next batch
          return setTimeout(() => {
            return this.processRecordsBatch(records, endIndex);
          }, 0);
        } else {
          // Processing complete
          this.dataReady = true; // Add flag to indicate data is ready
          return this.callLifecycleCallback('data-completed');
        }
      }

    };
    //expose these to the outside world
    $.pivotUtilities = {aggregatorTemplates, aggregators, renderers, derivers, locales, naturalSort, numberFormat, sortAs, PivotData, pivotTableRendererVirtualized, pivotTableRendererAsync};
    pivotTableRendererAsync = function(pivotData, opts) {
      var aborted, startTime;
      startTime = Date.now();
      aborted = false;
      return new Promise(function(resolve, reject) {
        var bufferSize, c, callLifecycle, colAttrs, colKey, colKeys, colSpans, containerHeight, createDataRow, currentIndex, defaults, error, estimatedVisibleRows, finishRendering, getClickHandler, headerHeight, i, j, precomputeSpans, processRowsBatch, r, ref, ref1, ref2, result, rowAttrs, rowHeight, rowKeys, rowSpans, shouldVirtualize, spanSize, tbody, th, thead, theadFragment, totalRows, tr, x;
        try {
          defaults = {
            renderChunkSize: 100, // Размер чанка для рендеринга строк
            lifecycleCallback: null,
            table: {
              clickCallback: null,
              rowTotals: true,
              colTotals: true,
              virtualization: {
                enabled: true,
                rowHeight: 30,
                bufferSize: 5,
                containerHeight: 400,
                headerHeight: 60,
                threshold: 1000, // Использовать виртуализацию для таблиц больше 1000 строк
                autoHeight: false // Автоматически определять высоту на основе pvtUi
              }
            },
            localeStrings: {
              totals: "Totals"
            }
          };
          opts = $.extend(true, {}, defaults, opts);
          callLifecycle = function(stage, progress = 0, metadata = null) {
            var abortFn, data, toggleVirtualizationFn;
            if (opts.lifecycleCallback == null) {
              return;
            }
            data = {
              stage: stage,
              progress: progress,
              elapsedTime: Date.now() - startTime,
              totalRows: metadata != null ? metadata.totalRows : void 0,
              totalCols: metadata != null ? metadata.totalCols : void 0,
              isVirtualized: metadata != null ? metadata.isVirtualized : void 0,
              domElements: metadata != null ? metadata.domElements : void 0,
              currentIndex: metadata != null ? metadata.currentIndex : void 0,
              endIndex: metadata != null ? metadata.endIndex : void 0
            };
            abortFn = null;
            if (stage === 'render-started' || stage === 'render-progress') {
              abortFn = function() {
                return aborted = true;
              };
            }
            toggleVirtualizationFn = null;
            if (stage === 'render-started') {
              toggleVirtualizationFn = function(enabled) {
                var ref, ref1;
                opts.table = (ref = opts.table) != null ? ref : {};
                opts.table.virtualization = (ref1 = opts.table.virtualization) != null ? ref1 : {};
                return opts.table.virtualization.enabled = enabled;
              };
            }
            return opts.lifecycleCallback(data, abortFn, toggleVirtualizationFn);
          };
          // Проверяем, нужна ли виртуализация
          totalRows = pivotData.getRowKeys().length;
          // Calculate estimated visible rows if virtualization is enabled
          estimatedVisibleRows = totalRows;
          if (opts.table.virtualization.enabled) {
            containerHeight = opts.table.virtualization.containerHeight || 500;
            rowHeight = opts.table.virtualization.rowHeight || 30;
            bufferSize = opts.table.virtualization.bufferSize || 5;
            headerHeight = 50; // estimated header height
            // Formula from calculateVisibleRange: Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize)
            estimatedVisibleRows = Math.min(totalRows, Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize));
          }
          callLifecycle('render-started', 0, {
            totalRows: totalRows,
            totalCols: pivotData.getColKeys().length,
            isVirtualized: opts.table.virtualization.enabled,
            estimatedVisibleRows: estimatedVisibleRows
          });
          if (aborted) {
            return resolve($("<div>").text("Rendering aborted by user")[0]);
          }
          shouldVirtualize = opts.table.virtualization.enabled;
          if (shouldVirtualize) {
            callLifecycle('render-progress', 0);
            result = pivotTableRendererVirtualized(pivotData, opts);
            callLifecycle('render-completed', 100, {
              totalRows: pivotData.getRowKeys().length,
              totalCols: pivotData.getColKeys().length,
              isVirtualized: true,
              domElements: result.querySelectorAll('*').length
            });
            resolve(result);
            return;
          }
          colAttrs = pivotData.colAttrs;
          rowAttrs = pivotData.rowAttrs;
          rowKeys = pivotData.getRowKeys();
          colKeys = pivotData.getColKeys();
          if (opts.table.clickCallback) {
            getClickHandler = function(value, rowValues, colValues) {
              var attr, filters, i;
              filters = {};
              for (i in colAttrs) {
                if (!hasProp.call(colAttrs, i)) continue;
                attr = colAttrs[i];
                if (colValues[i] != null) {
                  filters[attr] = colValues[i];
                }
              }
              for (i in rowAttrs) {
                if (!hasProp.call(rowAttrs, i)) continue;
                attr = rowAttrs[i];
                if (rowValues[i] != null) {
                  filters[attr] = rowValues[i];
                }
              }
              return function(e) {
                return opts.table.clickCallback(e, value, filters, pivotData);
              };
            };
          }
          precomputeSpans = function(arr) {
            var i, j, l, n, ref, ref1, spans;
            spans = [];
            for (i = l = 0, ref = arr.length; (0 <= ref ? l < ref : l > ref); i = 0 <= ref ? ++l : --l) {
              spans[i] = [];
              for (j = n = 0, ref1 = arr[i].length; (0 <= ref1 ? n < ref1 : n > ref1); j = 0 <= ref1 ? ++n : --n) {
                spans[i][j] = spanSize(arr, i, j);
              }
            }
            return spans;
          };
          //helper function for setting row/col-span in pivotTableRenderer
          spanSize = function(arr, i, j) {
            var l, len, n, noDraw, ref, ref1, stop, x;
            if (i !== 0) {
              noDraw = true;
              for (x = l = 0, ref = j; (0 <= ref ? l <= ref : l >= ref); x = 0 <= ref ? ++l : --l) {
                if (arr[i - 1][x] !== arr[i][x]) {
                  noDraw = false;
                }
              }
              if (noDraw) {
                return -1; //do not draw cell
              }
            }
            len = 0;
            while (i + len < arr.length) {
              stop = false;
              for (x = n = 0, ref1 = j; (0 <= ref1 ? n <= ref1 : n >= ref1); x = 0 <= ref1 ? ++n : --n) {
                if (arr[i][x] !== arr[i + len][x]) {
                  stop = true;
                }
              }
              if (stop) {
                break;
              }
              len++;
            }
            return len;
          };
          rowSpans = precomputeSpans(rowKeys);
          colSpans = precomputeSpans(colKeys);
          //now actually build the output
          result = document.createElement("table");
          result.className = "pvtTable";
          theadFragment = document.createDocumentFragment();
          for (j in colAttrs) {
            if (!hasProp.call(colAttrs, j)) continue;
            c = colAttrs[j];
            tr = document.createElement("tr");
            if (parseInt(j) === 0 && rowAttrs.length !== 0) {
              th = document.createElement("th");
              th.setAttribute("colspan", rowAttrs.length);
              th.setAttribute("rowspan", colAttrs.length);
              tr.appendChild(th);
            }
            th = document.createElement("th");
            th.className = "pvtAxisLabel";
            th.textContent = (ref = (ref1 = opts.labels) != null ? ref1[c] : void 0) != null ? ref : c;
            tr.appendChild(th);
            for (i in colKeys) {
              if (!hasProp.call(colKeys, i)) continue;
              colKey = colKeys[i];
              x = colSpans[parseInt(i)][parseInt(j)];
              if (x !== -1) {
                th = document.createElement("th");
                th.className = "pvtColLabel";
                th.textContent = colKey[j];
                th.setAttribute("colspan", x);
                if (parseInt(j) === colAttrs.length - 1 && rowAttrs.length !== 0) {
                  th.setAttribute("rowspan", 2);
                }
                tr.appendChild(th);
              }
            }
            if (parseInt(j) === 0 && opts.table.rowTotals) {
              th = document.createElement("th");
              th.className = "pvtTotalLabel pvtRowTotalLabel";
              th.innerHTML = opts.localeStrings.totals;
              th.setAttribute("rowspan", colAttrs.length + (rowAttrs.length === 0 ? 0 : 1));
              tr.appendChild(th);
            }
            theadFragment.appendChild(tr);
          }
          thead = document.createElement("thead");
          thead.appendChild(theadFragment);
          //then a row for row header headers
          if (rowAttrs.length !== 0) {
            tr = document.createElement("tr");
            for (i in rowAttrs) {
              if (!hasProp.call(rowAttrs, i)) continue;
              r = rowAttrs[i];
              th = document.createElement("th");
              th.className = "pvtAxisLabel";
              th.textContent = (ref2 = opts.labels[r]) != null ? ref2 : r;
              tr.appendChild(th);
            }
            th = document.createElement("th");
            if (colAttrs.length === 0) {
              th.className = "pvtTotalLabel pvtRowTotalLabel";
              th.innerHTML = opts.localeStrings.totals;
            }
            tr.appendChild(th);
            thead.appendChild(tr);
          }
          result.appendChild(thead);
          callLifecycle('render-progress', 1);
          if (aborted) {
            return resolve($("<div>").text("Rendering aborted by user")[0]);
          }
          // Async processing of data rows
          tbody = document.createElement("tbody");
          totalRows = rowKeys.length;
          currentIndex = 0;
          createDataRow = function(i, rowKey) {
            var aggregator, td, totalAggregator, txt, val;
            tr = document.createElement("tr");
            for (j in rowKey) {
              if (!hasProp.call(rowKey, j)) continue;
              txt = rowKey[j];
              x = rowSpans[parseInt(i)][parseInt(j)];
              if (x !== -1) {
                th = document.createElement("th");
                th.className = "pvtRowLabel";
                th.textContent = txt;
                th.setAttribute("rowspan", x);
                if (parseInt(j) === rowAttrs.length - 1 && colAttrs.length !== 0) {
                  th.setAttribute("colspan", 2);
                }
                tr.appendChild(th);
              }
            }
            for (j in colKeys) {
              if (!hasProp.call(colKeys, j)) continue;
              colKey = colKeys[j];
              aggregator = pivotData.getAggregator(rowKey, colKey);
              val = aggregator.value();
              td = document.createElement("td");
              td.className = `pvtVal row${i} col${j}`;
              td.textContent = aggregator.format(val);
              td.setAttribute("data-value", val);
              if (getClickHandler != null) {
                td.onclick = getClickHandler(val, rowKey, colKey);
              }
              tr.appendChild(td);
            }
            if (opts.table.rowTotals || colAttrs.length === 0) {
              totalAggregator = pivotData.getAggregator(rowKey, []);
              val = totalAggregator.value();
              td = document.createElement("td");
              td.className = "pvtTotal rowTotal";
              td.textContent = totalAggregator.format(val);
              td.setAttribute("data-value", val);
              if (getClickHandler != null) {
                td.onclick = getClickHandler(val, rowKey, []);
              }
              td.setAttribute("data-for", `row${i}`);
              tr.appendChild(td);
            }
            return tr;
          };
          processRowsBatch = function() {
            var batchSize, endIndex, fragment, l, progress, ref3, ref4, rowKey;
            if (currentIndex >= totalRows || aborted) {
              return;
            }
            batchSize = Math.min(opts.renderChunkSize, totalRows - currentIndex);
            endIndex = currentIndex + batchSize;
            fragment = document.createDocumentFragment();
            for (i = l = ref3 = currentIndex, ref4 = endIndex; (ref3 <= ref4 ? l < ref4 : l > ref4); i = ref3 <= ref4 ? ++l : --l) {
              rowKey = rowKeys[i];
              tr = createDataRow(i, rowKey);
              fragment.appendChild(tr);
            }
            tbody.appendChild(fragment);
            progress = 1 + Math.round((endIndex / totalRows) * 98);
            callLifecycle('render-progress', progress, {
              currentIndex: currentIndex,
              endIndex: endIndex,
              totalRows: totalRows
            });
            if (aborted) {
              return;
            }
            currentIndex = endIndex;
            if (currentIndex >= totalRows) {
              return finishRendering();
            } else {
              if (window.requestAnimationFrame != null) {
                return requestAnimationFrame(processRowsBatch);
              } else {
                return setTimeout(processRowsBatch, 1);
              }
            }
          };
          finishRendering = function() {
            var td, totalAggregator, totalsFragment, val;
            callLifecycle('render-progress', 100, {
              currentIndex: currentIndex,
              endIndex: currentIndex,
              totalRows: totalRows
            });
            if (aborted) {
              return;
            }
            //finally, the row for col totals, and a grand total
            if (opts.table.colTotals || rowAttrs.length === 0) {
              tr = document.createElement("tr");
              if (opts.table.colTotals || rowAttrs.length === 0) {
                th = document.createElement("th");
                th.className = "pvtTotalLabel pvtColTotalLabel";
                th.innerHTML = opts.localeStrings.totals;
                th.setAttribute("colspan", rowAttrs.length + (colAttrs.length === 0 ? 0 : 1));
                tr.appendChild(th);
              }
              totalsFragment = document.createDocumentFragment();
              for (j in colKeys) {
                if (!hasProp.call(colKeys, j)) continue;
                colKey = colKeys[j];
                totalAggregator = pivotData.getAggregator([], colKey);
                val = totalAggregator.value();
                td = document.createElement("td");
                td.className = "pvtTotal colTotal";
                td.textContent = totalAggregator.format(val);
                td.setAttribute("data-value", val);
                if (getClickHandler != null) {
                  td.onclick = getClickHandler(val, [], colKey);
                }
                td.setAttribute("data-for", "col" + j);
                totalsFragment.appendChild(td);
              }
              tr.appendChild(totalsFragment);
              if (opts.table.rowTotals || colAttrs.length === 0) {
                totalAggregator = pivotData.getAggregator([], []);
                val = totalAggregator.value();
                td = document.createElement("td");
                td.className = "pvtGrandTotal";
                td.textContent = totalAggregator.format(val);
                td.setAttribute("data-value", val);
                if (getClickHandler != null) {
                  td.onclick = getClickHandler(val, [], []);
                }
                tr.appendChild(td);
              }
              tbody.appendChild(tr);
            }
            result.appendChild(tbody);
            callLifecycle('render-completed', 100, {
              totalRows: rowKeys.length,
              totalCols: colKeys.length,
              isVirtualized: false,
              domElements: result.querySelectorAll('*').length
            });
            return resolve(result);
          };
          // Начинаем обработку строк
          if (totalRows > 0) {
            return processRowsBatch();
          } else {
            return finishRendering();
          }
        } catch (error1) {
          error = error1;
          console.error("Error during async rendering:", error);
          return reject(error);
        }
      });
    };
    pivotTableRenderer = function(pivotData, opts) {
      var aborted, aggregator, c, callLifecycle, colAttrs, colKey, colKeys, defaults, getClickHandler, i, j, r, ref, ref1, result, rowAttrs, rowKey, rowKeys, spanSize, startTime, tbody, td, th, thead, totalAggregator, tr, txt, val, x;
      defaults = {
        table: {
          clickCallback: null,
          rowTotals: true,
          colTotals: true
        },
        localeStrings: {
          totals: "Totals"
        },
        lifecycleCallback: null
      };
      opts = $.extend(true, {}, defaults, opts);
      aborted = false;
      startTime = Date.now();
      callLifecycle = function(stage, progress = 0, metadata = null) {
        var abortFn, data, toggleVirtualizationFn;
        if (opts.lifecycleCallback == null) {
          return;
        }
        data = {
          stage: stage,
          progress: progress,
          elapsedTime: Date.now() - startTime,
          totalRows: metadata != null ? metadata.totalRows : void 0,
          totalCols: metadata != null ? metadata.totalCols : void 0,
          isVirtualized: false,
          domElements: metadata != null ? metadata.domElements : void 0,
          currentIndex: metadata != null ? metadata.currentIndex : void 0,
          endIndex: metadata != null ? metadata.endIndex : void 0
        };
        // totalRows: pivotData.getRowKeys().length
        // totalCols: pivotData.getColKeys().length
        abortFn = null;
        toggleVirtualizationFn = null;
        if (stage === 'render-started' || stage === 'render-progress') {
          abortFn = function() {
            return aborted = true;
          };
        }
        return opts.lifecycleCallback(data, abortFn, toggleVirtualizationFn);
      };
      callLifecycle('render-started');
      if (aborted) {
        return $("<div>").text("Rendering aborted by user")[0];
      }
      colAttrs = pivotData.colAttrs;
      rowAttrs = pivotData.rowAttrs;
      rowKeys = pivotData.getRowKeys();
      colKeys = pivotData.getColKeys();
      if (opts.table.clickCallback) {
        getClickHandler = function(value, rowValues, colValues) {
          var attr, filters, i;
          filters = {};
          for (i in colAttrs) {
            if (!hasProp.call(colAttrs, i)) continue;
            attr = colAttrs[i];
            if (colValues[i] != null) {
              filters[attr] = colValues[i];
            }
          }
          for (i in rowAttrs) {
            if (!hasProp.call(rowAttrs, i)) continue;
            attr = rowAttrs[i];
            if (rowValues[i] != null) {
              filters[attr] = rowValues[i];
            }
          }
          return function(e) {
            return opts.table.clickCallback(e, value, filters, pivotData);
          };
        };
      }
      //now actually build the output
      result = document.createElement("table");
      result.className = "pvtTable";
      //helper function for setting row/col-span in pivotTableRenderer
      spanSize = function(arr, i, j) {
        var l, len, n, noDraw, ref, ref1, stop, x;
        if (i !== 0) {
          noDraw = true;
          for (x = l = 0, ref = j; (0 <= ref ? l <= ref : l >= ref); x = 0 <= ref ? ++l : --l) {
            if (arr[i - 1][x] !== arr[i][x]) {
              noDraw = false;
            }
          }
          if (noDraw) {
            return -1; //do not draw cell
          }
        }
        len = 0;
        while (i + len < arr.length) {
          stop = false;
          for (x = n = 0, ref1 = j; (0 <= ref1 ? n <= ref1 : n >= ref1); x = 0 <= ref1 ? ++n : --n) {
            if (arr[i][x] !== arr[i + len][x]) {
              stop = true;
            }
          }
          if (stop) {
            break;
          }
          len++;
        }
        return len;
      };
      //the first few rows are for col headers
      thead = document.createElement("thead");
      for (j in colAttrs) {
        if (!hasProp.call(colAttrs, j)) continue;
        c = colAttrs[j];
        tr = document.createElement("tr");
        if (parseInt(j) === 0 && rowAttrs.length !== 0) {
          th = document.createElement("th");
          th.setAttribute("colspan", rowAttrs.length);
          th.setAttribute("rowspan", colAttrs.length);
          tr.appendChild(th);
        }
        th = document.createElement("th");
        th.className = "pvtAxisLabel";
        th.textContent = (ref = opts.labels[c]) != null ? ref : c;
        tr.appendChild(th);
        for (i in colKeys) {
          if (!hasProp.call(colKeys, i)) continue;
          colKey = colKeys[i];
          x = spanSize(colKeys, parseInt(i), parseInt(j));
          if (x !== -1) {
            th = document.createElement("th");
            th.className = "pvtColLabel";
            th.textContent = colKey[j];
            th.setAttribute("colspan", x);
            if (parseInt(j) === colAttrs.length - 1 && rowAttrs.length !== 0) {
              th.setAttribute("rowspan", 2);
            }
            tr.appendChild(th);
          }
        }
        if (parseInt(j) === 0 && opts.table.rowTotals) {
          th = document.createElement("th");
          th.className = "pvtTotalLabel pvtRowTotalLabel";
          th.innerHTML = opts.localeStrings.totals;
          th.setAttribute("rowspan", colAttrs.length + (rowAttrs.length === 0 ? 0 : 1));
          tr.appendChild(th);
        }
        thead.appendChild(tr);
      }
      //then a row for row header headers
      if (rowAttrs.length !== 0) {
        tr = document.createElement("tr");
        for (i in rowAttrs) {
          if (!hasProp.call(rowAttrs, i)) continue;
          r = rowAttrs[i];
          th = document.createElement("th");
          th.className = "pvtAxisLabel";
          th.textContent = (ref1 = opts.labels[r]) != null ? ref1 : r;
          tr.appendChild(th);
        }
        th = document.createElement("th");
        if (colAttrs.length === 0) {
          th.className = "pvtTotalLabel pvtRowTotalLabel";
          th.innerHTML = opts.localeStrings.totals;
        }
        tr.appendChild(th);
        thead.appendChild(tr);
      }
      result.appendChild(thead);
      //now the actual data rows, with their row headers and totals
      tbody = document.createElement("tbody");
      for (i in rowKeys) {
        if (!hasProp.call(rowKeys, i)) continue;
        rowKey = rowKeys[i];
        tr = document.createElement("tr");
        for (j in rowKey) {
          if (!hasProp.call(rowKey, j)) continue;
          txt = rowKey[j];
          x = spanSize(rowKeys, parseInt(i), parseInt(j));
          if (x !== -1) {
            th = document.createElement("th");
            th.className = "pvtRowLabel";
            th.textContent = txt;
            th.setAttribute("rowspan", x);
            if (parseInt(j) === rowAttrs.length - 1 && colAttrs.length !== 0) {
              th.setAttribute("colspan", 2);
            }
            tr.appendChild(th);
          }
        }
//this is the tight loop
        for (j in colKeys) {
          if (!hasProp.call(colKeys, j)) continue;
          colKey = colKeys[j];
          aggregator = pivotData.getAggregator(rowKey, colKey);
          val = aggregator.value();
          td = document.createElement("td");
          td.className = `pvtVal row${i} col${j}`;
          td.textContent = aggregator.format(val);
          td.setAttribute("data-value", val);
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, colKey);
          }
          tr.appendChild(td);
        }
        if (opts.table.rowTotals || colAttrs.length === 0) {
          totalAggregator = pivotData.getAggregator(rowKey, []);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal rowTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, []);
          }
          td.setAttribute("data-for", "row" + i);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      //finally, the row for col totals, and a grand total
      if (opts.table.colTotals || rowAttrs.length === 0) {
        tr = document.createElement("tr");
        if (opts.table.colTotals || rowAttrs.length === 0) {
          th = document.createElement("th");
          th.className = "pvtTotalLabel pvtColTotalLabel";
          th.innerHTML = opts.localeStrings.totals;
          th.setAttribute("colspan", rowAttrs.length + (colAttrs.length === 0 ? 0 : 1));
          tr.appendChild(th);
        }
        for (j in colKeys) {
          if (!hasProp.call(colKeys, j)) continue;
          colKey = colKeys[j];
          totalAggregator = pivotData.getAggregator([], colKey);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal colTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], colKey);
          }
          td.setAttribute("data-for", "col" + j);
          tr.appendChild(td);
        }
        if (opts.table.rowTotals || colAttrs.length === 0) {
          totalAggregator = pivotData.getAggregator([], []);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtGrandTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], []);
          }
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      result.appendChild(tbody);
      callLifecycle('render-completed', 100, {
        totalRows: rowKeys.length,
        totalCols: colKeys.length,
        domElements: result.querySelectorAll('*').length
      });
      return result;
    };
    /*
    Pivot Table core: create PivotData object and call Renderer on it
    */
    $.fn.pivot = function(input, inputOpts, locale = "en") {
      var defaults, e, localeDefaults, localeStrings, opts, pivotData, result, x;
      if (locales[locale] == null) {
        locale = "en";
      }
      defaults = {
        cols: [],
        rows: [],
        vals: [],
        rowOrder: "key_a_to_z",
        colOrder: "key_a_to_z",
        dataClass: PivotData,
        filter: function() {
          return true;
        },
        aggregator: aggregatorTemplates.count()(),
        aggregatorName: "Count",
        sorters: {},
        labels: {},
        derivedAttributes: {},
        renderer: pivotTableRenderer,
        asyncMode: false
      };
      localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings);
      localeDefaults = {
        rendererOptions: {
          localeSettings: localeStrings,
          labels: {},
          table: {
            virtualization: {
              enabled: false
            }
          },
          progressInterval: 1000,
          renderChunkSize: 25,
          lifecycleCallback: null
        },
        localeStrings: localeStrings
      };
      opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts));
      // Передаем ссылку на элемент для автоопределения высоты
      opts.rendererOptions.pivotUIElement = x;
      x = this[0];
      if (opts.asyncMode) {
        // Async mode - return promise
        return new Promise((resolve, reject) => {
          var checkDataReady, e, loadingDiv, pivotData;
          while (x.hasChildNodes()) {
            x.removeChild(x.lastChild);
          }
          // Show loading indicator
          loadingDiv = document.createElement("div");
          loadingDiv.className = "pvt-loading";
          loadingDiv.innerHTML = "Processing data...";
          x.appendChild(loadingDiv);
          try {
            pivotData = new opts.dataClass(input, opts);
            // Store instance for abort functionality
            x.pivotDataInstance = pivotData;
            // Wait for async data processing to complete
            checkDataReady = () => {
              var e, func, isTableRenderer, name, ref, ref1, rendererFunction, rendererName;
              if (pivotData.dataReady || pivotData.aborted) {
                if (pivotData.aborted) {
                  reject(new Error("Processing aborted"));
                  return;
                }
                try {
                  // Check if this is a table renderer
                  // Can be: direct function reference, string "Table", or resolved function from renderers dict
                  rendererFunction = opts.renderer;
                  rendererName = null;
                  // If renderer is a string, resolve it to function
                  if (typeof opts.renderer === "string") {
                    rendererName = opts.renderer;
                    rendererFunction = ((ref = opts.renderers) != null ? ref[opts.renderer] : void 0) || renderers[opts.renderer];
                  } else if ($.isFunction(opts.renderer)) {
                    ref1 = opts.renderers || renderers;
                    // Try to find the renderer name by comparing functions
                    for (name in ref1) {
                      func = ref1[name];
                      if (func === opts.renderer) {
                        rendererName = name;
                        break;
                      }
                    }
                  }
                  // Check if this is a table renderer
                  isTableRenderer = (rendererFunction === pivotTableRenderer) || (rendererName === "Table") || ($.isFunction(rendererFunction) && rendererFunction.toString().indexOf("pivotTableRenderer") > -1);
                  if (isTableRenderer) {
                    // Use async renderer for table
                    return pivotTableRendererAsync(pivotData, opts.rendererOptions).then((result) => {
                      while (x.hasChildNodes()) {
                        x.removeChild(x.lastChild);
                      }
                      x.appendChild(result);
                      return resolve(result);
                    }).catch((error) => {
                      return reject(error);
                    });
                  } else {
                    // Use regular renderer but wrapped in async chunks
                    return setTimeout(() => {
                      var error, renderSyncInChunks;
                      try {
                        // Break sync renderer into chunks too
                        renderSyncInChunks = function() {
                          return setTimeout(() => {
                            var error, result;
                            try {
                              result = opts.renderer(pivotData, opts.rendererOptions);
                              while (x.hasChildNodes()) {
                                x.removeChild(x.lastChild);
                              }
                              x.appendChild(result);
                              return resolve(result);
                            } catch (error1) {
                              error = error1;
                              return reject(error);
                            }
                          }, 1); // Small delay to allow UI updates
                        };
                        return renderSyncInChunks();
                      } catch (error1) {
                        error = error1;
                        return reject(error);
                      }
                    }, 1);
                  }
                } catch (error1) {
                  e = error1;
                  if (typeof console !== "undefined" && console !== null) {
                    console.error(e.stack);
                  }
                  return reject(e);
                }
              } else {
                return setTimeout(checkDataReady, 100);
              }
            };
            return checkDataReady();
          } catch (error1) {
            e = error1;
            if (typeof console !== "undefined" && console !== null) {
              console.error(e.stack);
            }
            return reject(e);
          }
        });
      } else {
        // Sync mode - original behavior
        result = null;
        try {
          pivotData = new opts.dataClass(input, opts);
          try {
            result = opts.renderer(pivotData, opts.rendererOptions);
          } catch (error1) {
            e = error1;
            if (typeof console !== "undefined" && console !== null) {
              console.error(e.stack);
            }
            result = $("<span>").html(opts.localeStrings.renderError);
          }
        } catch (error1) {
          e = error1;
          if (typeof console !== "undefined" && console !== null) {
            console.error(e.stack);
          }
          result = $("<span>").html(opts.localeStrings.computeError);
        }
        while (x.hasChildNodes()) {
          x.removeChild(x.lastChild);
        }
        if (result) {
          x.appendChild(result);
        }
        return this;
      }
    };
    /*
    Pivot Table UI: calls Pivot Table core above with options set by user
    */
    $.fn.pivotUI = function(input, inputOpts, overwrite = false, locale = "en") {
      var a, aggregator, attr, attrValues, c, calculateComplexity, colOrderArrow, controlsToolbar, defaults, e, existingOpts, i, initialRender, l, len1, len2, localeDefaults, localeStrings, materializedInput, n, opts, orderGroup, ordering, panelsGroup, pivotTable, recordsProcessed, ref, ref1, ref2, ref3, refresh, refreshButton, refreshDelayed, refreshGroup, renderer, rendererControl, responsive, rowOrderArrow, rulesVisibility, shownAttributes, shownInAggregators, shownInDragDrop, tr0, tr1, tr2, uiTable, unused, unusedAttrsVerticalAutoOverride, unusedVisibility, visible, x;
      if (locales[locale] == null) {
        locale = "en";
      }
      defaults = {
        derivedAttributes: {},
        aggregators: locales[locale].aggregators,
        renderers: locales[locale].renderers,
        hiddenAttributes: [],
        hiddenFromAggregators: [],
        hiddenFromDragDrop: [],
        menuLimit: 500,
        cols: [],
        rows: [],
        vals: [],
        rowOrder: "key_a_to_z",
        colOrder: "key_a_to_z",
        dataClass: PivotData,
        exclusions: {},
        inclusions: {},
        unusedAttrsVertical: 85,
        autoSortUnusedAttrs: false,
        onRefresh: null,
        complexityCallback: null, //callback to check if computation should proceed based on complexity heuristics
        showUI: true,
        labels: {},
        controls: {
          unused: false,
          rules: false
        },
        filter: function() {
          return true;
        },
        sorters: {},
        asyncMode: false
      };
      localeStrings = $.extend(true, {}, locales.en.localeStrings, locales[locale].localeStrings);
      localeDefaults = {
        rendererOptions: {
          localeStrings,
          lifecycleCallback: null,
          progressInterval: 1000,
          renderChunkSize: 25,
          table: {
            virtualization: {
              autoHeight: false // Автоматически определять высоту на основе pvtUi
            }
          }
        },
        localeStrings: localeStrings
      };
      existingOpts = this.data("pivotUIOptions");
      if ((existingOpts == null) || overwrite) {
        opts = $.extend(true, {}, localeDefaults, $.extend({}, defaults, inputOpts));
      } else {
        opts = existingOpts;
      }
      try {
        // do a first pass on the data to cache a materialized copy of any
        // function-valued inputs and to compute dimension cardinalities
        attrValues = {};
        materializedInput = [];
        recordsProcessed = 0;
        PivotData.forEachRecord(input, opts.derivedAttributes, function(record) {
          var attr, base, ref, value;
          if (!opts.filter(record)) {
            return;
          }
          materializedInput.push(record);
          for (attr in record) {
            if (!hasProp.call(record, attr)) continue;
            if (attrValues[attr] == null) {
              attrValues[attr] = {};
              if (recordsProcessed > 0) {
                attrValues[attr]["null"] = recordsProcessed;
              }
            }
          }
          for (attr in attrValues) {
            value = (ref = record[attr]) != null ? ref : "null";
            if ((base = attrValues[attr])[value] == null) {
              base[value] = 0;
            }
            attrValues[attr][value]++;
          }
          return recordsProcessed++;
        });
        //start building the output
        uiTable = $("<table>", {
          class: "pvtUi"
        }).attr("cellpadding", 5);
        //renderer control
        rendererControl = $("<td>", {
          colspan: "3",
          class: "pvtUiCell pvtUiControls"
        });
        renderer = $("<select>").addClass("pvtRenderer").appendTo(rendererControl).bind("change", function() {
          return refresh(); //capture reference
        });
        ref = opts.renderers;
        for (x in ref) {
          if (!hasProp.call(ref, x)) continue;
          $("<option>").val(x).html(x).appendTo(renderer);
        }
        //axis list, including the double-click menu
        unused = $("<td>", {
          class: "pvtAxisContainer pvtUnused pvtUiCell"
        });
        shownAttributes = (function() {
          var results;
          results = [];
          for (a in attrValues) {
            if (indexOf.call(opts.hiddenAttributes, a) < 0) {
              results.push(a);
            }
          }
          return results;
        })();
        shownInAggregators = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = shownAttributes.length; l < len1; l++) {
            c = shownAttributes[l];
            if (indexOf.call(opts.hiddenFromAggregators, c) < 0) {
              results.push(c);
            }
          }
          return results;
        })();
        shownInDragDrop = (function() {
          var l, len1, results;
          results = [];
          for (l = 0, len1 = shownAttributes.length; l < len1; l++) {
            c = shownAttributes[l];
            if (indexOf.call(opts.hiddenFromDragDrop, c) < 0) {
              results.push(c);
            }
          }
          return results;
        })();
        unusedAttrsVerticalAutoOverride = true;
        if (opts.unusedAttrsVertical === true || unusedAttrsVerticalAutoOverride) {
          unused.addClass('pvtVertList');
        } else {
          unused.addClass('pvtHorizList');
        }
        for (i in shownInDragDrop) {
          if (!hasProp.call(shownInDragDrop, i)) continue;
          attr = shownInDragDrop[i];
          (function(attr) {
            var attrElem, checkContainer, closeFilterBox, controls, controlsButtons, filterItem, filterItemExcluded, finalButtons, hasExcludedItem, l, len1, placeholder, ref1, ref2, ref3, ref4, sorter, triangleLink, v, value, valueBody, valueCount, valueFooter, valueHeading, valueList, values;
            values = (function() {
              var results;
              results = [];
              for (v in attrValues[attr]) {
                results.push(v);
              }
              return results;
            })();
            hasExcludedItem = false;
            valueList = $("<div>", {
              class: "pvtFilterBox panel panel-default"
            }).hide();
            valueHeading = $("<div>", {
              class: "panel-heading"
            });
            valueBody = $("<div>", {
              class: "panel-body"
            });
            valueFooter = $("<div>", {
              class: "panel-footer"
            });
            valueList.append(valueHeading);
            valueList.append(valueBody);
            valueList.append(valueFooter);
            valueHeading.append($("<h4>", {
              class: "panel-title"
            }).append($("<span>").text((ref1 = opts.labels[attr]) != null ? ref1 : attr), $("<span>").addClass("count").text(`(${values.length})`)));
            if (values.length > opts.menuLimit) {
              valueList.append($("<p>").html(opts.localeStrings.tooMany));
            } else {
              if (values.length > 5) {
                controls = $("<div>", {
                  class: "input-group"
                }).appendTo(valueBody);
                sorter = getSort(opts.sorters, attr);
                placeholder = opts.localeStrings.filterResults;
                $("<input>").appendTo(controls).attr({
                  placeholder: placeholder,
                  class: "pvtSearch form-control input-sm",
                  type: "text"
                }).bind("keyup", function() {
                  var accept, accept_gen, filter;
                  filter = $(this).val().toLowerCase().trim();
                  accept_gen = function(prefix, accepted) {
                    return function(v) {
                      var real_filter, ref2;
                      real_filter = filter.substring(prefix.length).trim();
                      if (real_filter.length === 0) {
                        return true;
                      }
                      return ref2 = Math.sign(sorter(v.toLowerCase(), real_filter)), indexOf.call(accepted, ref2) >= 0;
                    };
                  };
                  accept = filter.indexOf(">=") === 0 ? accept_gen(">=", [1, 0]) : filter.indexOf("<=") === 0 ? accept_gen("<=", [-1, 0]) : filter.indexOf(">") === 0 ? accept_gen(">", [1]) : filter.indexOf("<") === 0 ? accept_gen("<", [-1]) : filter.indexOf("~") === 0 ? function(v) {
                    if (filter.substring(1).trim().length === 0) {
                      return true;
                    }
                    return v.toLowerCase().match(filter.substring(1));
                  } : function(v) {
                    return v.toLowerCase().indexOf(filter) !== -1;
                  };
                  return valueList.find('.pvtCheckContainer label span.value').each(function() {
                    if (accept($(this).text())) {
                      return $(this).parent().parent().addClass('pvtFilterIn').show();
                    } else {
                      return $(this).parent().parent().removeClass("pvtFilterIn").hide();
                    }
                  });
                });
                controlsButtons = $("<span>", {
                  class: "input-group-btn"
                }).appendTo(controls);
                $("<button>", {
                  type: "button",
                  class: "btn btn-default btn-sm",
                  title: opts.localeStrings.selectAll
                }).appendTo(controlsButtons).append($("<i>", {
                  class: "far fa-fw fa-check-square"
                })).bind("click", function() {
                  valueList.find("input:visible:not(:checked)").prop("checked", true).toggleClass("changed");
                  return false;
                });
                $("<button>", {
                  type: "button",
                  class: "btn btn-default btn-sm",
                  title: opts.localeStrings.selectNone
                }).appendTo(controlsButtons).append($("<i>", {
                  class: "far fa-fw fa-square"
                })).bind("click", function() {
                  valueList.find("input:visible:checked").prop("checked", false).toggleClass("changed");
                  return false;
                });
              }
              checkContainer = $("<div>", {
                class: "pvtCheckContainer"
              }).appendTo(valueBody);
              ref2 = values.sort(getSort(opts.sorters, attr));
              for (l = 0, len1 = ref2.length; l < len1; l++) {
                value = ref2[l];
                valueCount = attrValues[attr][value];
                filterItem = $("<label>");
                filterItemExcluded = false;
                if (opts.inclusions[attr]) {
                  filterItemExcluded = (indexOf.call(opts.inclusions[attr], value) < 0);
                } else if (opts.exclusions[attr]) {
                  filterItemExcluded = (indexOf.call(opts.exclusions[attr], value) >= 0);
                }
                hasExcludedItem || (hasExcludedItem = filterItemExcluded);
                $("<input>").attr("type", "checkbox").addClass('pvtFilter').attr("checked", !filterItemExcluded).data("filter", [attr, value]).appendTo(filterItem).bind("change", function() {
                  return $(this).toggleClass("changed");
                });
                filterItem.append($("<span>").addClass("value").text(value));
                filterItem.append($("<span>").addClass("count").text("(" + valueCount + ")"));
                checkContainer.append($("<div>", {
                  class: "checkbox"
                }).append(filterItem));
              }
            }
            closeFilterBox = function() {
              if (valueList.find("[type='checkbox']").length > valueList.find("[type='checkbox']:checked").length) {
                attrElem.addClass("pvtFilteredAttribute");
              } else {
                attrElem.removeClass("pvtFilteredAttribute");
              }
              valueList.find('.pvtSearch').val('');
              valueList.find('.pvtCheckContainer div.checkbox').show();
              return valueList.hide();
            };
            finalButtons = $("<div>", {
              class: "text-right"
            }).appendTo(valueFooter);
            if (values.length <= opts.menuLimit) {
              $("<button>", {
                type: "button",
                class: "btn btn-default btn-sm"
              }).text(opts.localeStrings.apply).appendTo(finalButtons).bind("click", function() {
                if (valueList.find(".changed").removeClass("changed").length) {
                  refresh();
                }
                return closeFilterBox();
              });
              $("<span>").html('&nbsp;').appendTo(finalButtons);
            }
            $("<button>", {
              type: "button",
              class: "btn btn-default btn-sm"
            }).text(opts.localeStrings.cancel).appendTo(finalButtons).bind("click", function() {
              valueList.find(".changed:checked").removeClass("changed").prop("checked", false);
              valueList.find(".changed:not(:checked)").removeClass("changed").prop("checked", true);
              return closeFilterBox();
            });
            triangleLink = $("<i>", {
              class: "fas fa-fw fa-caret-down"
            }).addClass('pvtTriangle').bind("click", function(e) {
              var UI, UIHeight, UIOffset, space, targetOffset, top, valueListHeight;
              UI = $(".pvtUi");
              UIHeight = UI.height();
              UIOffset = UI.offset();
              targetOffset = $(e.currentTarget).offset();
              valueListHeight = valueList.height();
              space = UIHeight - (targetOffset.top - UIOffset.top);
              if (space > valueListHeight) {
                top = targetOffset.top - UIOffset.top;
              } else if (space > valueListHeight / 2) {
                top = targetOffset.top - UIOffset.top - valueListHeight / 2;
              } else {
                top = targetOffset.top - UIOffset.top - valueListHeight;
              }
              $(".pvtFilterBox").hide();
              return valueList.css({
                left: targetOffset.left - UIOffset.left + 10,
                top: top + 10
              }).show();
            });
            attrElem = $("<li>").addClass(`axis_${i}`).append($("<span>").addClass('label label-default pvtAttr').attr("title", (ref4 = opts.labels[attr]) != null ? ref4 : attr).text((ref3 = opts.labels[attr]) != null ? ref3 : attr).data("attrName", attr).append(triangleLink));
            if (hasExcludedItem) {
              attrElem.addClass('pvtFilteredAttribute');
            }
            unused.append(attrElem);
            return rendererControl.append(valueList);
          })(attr);
        }
        tr0 = $("<tr>").appendTo(uiTable);
        tr1 = $("<tr>").appendTo(uiTable);
        //aggregator menu and value area
        aggregator = $("<select>").addClass('pvtAggregator').bind("change", function() {
          return refresh(); //capture reference
        });
        ref1 = opts.aggregators;
        for (x in ref1) {
          if (!hasProp.call(ref1, x)) continue;
          aggregator.append($("<option>").val(x).html(x));
        }
        rendererControl.append(" ").append(aggregator);
        ordering = {
          key_a_to_z: {
            rowSymbol: $("<i>", {
              class: "far fa-fw fa-arrows-alt-v"
            }),
            colSymbol: $("<i>", {
              class: "far fa-fw fa-arrows-alt-h"
            }),
            next: "value_a_to_z"
          },
          value_a_to_z: {
            rowSymbol: $("<i>", {
              class: "far fa-fw fa-long-arrow-alt-down"
            }),
            colSymbol: $("<i>", {
              class: "far fa-fw fa-long-arrow-alt-right"
            }),
            next: "value_z_to_a"
          },
          value_z_to_a: {
            rowSymbol: $("<i>", {
              class: "far fa-fw fa-long-arrow-alt-up"
            }),
            colSymbol: $("<i>", {
              class: "far fa-fw fa-long-arrow-alt-left"
            }),
            next: "key_a_to_z"
          }
        };
        rowOrderArrow = $("<button>", {
          class: "btn btn-default btn-xs" //.addClass("pvtRowOrder")
        }).data("order", opts.rowOrder).html(ordering[opts.rowOrder].rowSymbol).bind("click", function() {
          $(this).data("order", ordering[$(this).data("order")].next);
          $(this).html(ordering[$(this).data("order")].rowSymbol);
          return refresh();
        });
        colOrderArrow = $("<button>", {
          class: "btn btn-default btn-xs" //.addClass("pvtColOrder")
        }).data("order", opts.colOrder).html(ordering[opts.colOrder].colSymbol).bind("click", function() {
          $(this).data("order", ordering[$(this).data("order")].next);
          $(this).html(ordering[$(this).data("order")].colSymbol);
          return refresh();
        });
        orderGroup = $("<div>", {
          class: "btn-group",
          role: "group"
        }).append(rowOrderArrow).append(colOrderArrow);
        unusedVisibility = $("<button>", {
          class: "btn btn-default btn-xs"
        }).append($("<i>", {
          class: "far fa-fw fa-ruler-vertical fa-flip-horizontal"
        })).bind("click", function() {
          var pvtVals;
          $(this).toggleClass('active');
          $(".pvtUnused").toggle();
          pvtVals = $(".pvtVals");
          if (pvtVals.attr("colspan") === "2") {
            return pvtVals.attr("colspan", 1);
          } else {
            return pvtVals.attr("colspan", 2);
          }
        });
        if (opts.controls.unused) {
          unusedVisibility.addClass("active");
        }
        rulesVisibility = $("<button>", {
          class: "btn btn-default btn-xs"
        }).append($("<i>", {
          class: "far fa-fw fa-ruler-combined fa-flip-vertical"
        })).bind("click", function() {
          $(this).toggleClass('active');
          return $(".pvtRows, .pvtCols").toggle();
        });
        if (opts.controls.rules) {
          rulesVisibility.addClass("active");
        }
        panelsGroup = $("<div>", {
          class: "btn-group",
          role: "group"
        }).append(unusedVisibility).append(rulesVisibility);
        // Create refresh button (initially hidden)
        refreshButton = $("<button>", {
          class: "btn btn-default btn-xs pvtRefreshBtn",
          style: "display: none;"
        }).append($("<i>", {
          class: "fas fa-fw fa-sync-alt"
        })).attr("title", "Refresh calculation").bind("click", function() {
          $(this).hide();
          return refresh(false, true); // force refresh
        });
        refreshGroup = $("<div>", {
          class: "btn-group",
          role: "group"
        }).append(refreshButton);
        controlsToolbar = $("<div>", {
          class: "btn-toolbar"
        }).append(panelsGroup).append(orderGroup).append(refreshGroup);
        $("<td>", {
          class: "pvtVals pvtUiCell"
        }).appendTo(tr1).append(controlsToolbar);
        //column axes
        $("<td>").addClass('pvtAxisContainer pvtHorizList pvtCols pvtUiCell').appendTo(tr1);
        //row axes
        tr2 = $("<tr>").appendTo(uiTable);
        tr2.append($("<td>").addClass('pvtAxisContainer pvtRows pvtUiCell').attr("valign", "top"));
        //the actual pivot table container
        pivotTable = $("<td>").attr("valign", "top").addClass('pvtRendererArea').appendTo(tr2);
        //finally the renderer dropdown and unused attribs are inserted at the requested location
        if (opts.unusedAttrsVertical === true || unusedAttrsVerticalAutoOverride) {
          uiTable.find('tr:nth-child(1)').prepend(rendererControl);
          uiTable.find('tr:nth-child(3)').prepend(unused);
        } else {
          uiTable.prepend($("<tr>").append(rendererControl).append(unused));
        }
        //render the UI in its default state
        visible = $("<div>", {
          class: "pvtVisible"
        });
        responsive = $("<div>", {
          class: "pvtResponsive"
        }).appendTo(visible);
        uiTable.appendTo(responsive);
        this.html(visible);
        if (!opts.controls.rules) {
          $(".pvtRows, .pvtCols").hide();
        }
        if (!opts.controls.unused) {
          $(".pvtUnused").hide();
        }
        if (opts.controls.unused) {
          $(".pvtVals").attr("colspan", 2);
        }
        ref2 = opts.cols;
        //set up the UI initial state as requested by moving elements around
        for (l = 0, len1 = ref2.length; l < len1; l++) {
          x = ref2[l];
          this.find(".pvtCols").append(this.find(`.axis_${$.inArray(x, shownInDragDrop)}`));
        }
        ref3 = opts.rows;
        for (n = 0, len2 = ref3.length; n < len2; n++) {
          x = ref3[n];
          this.find(".pvtRows").append(this.find(`.axis_${$.inArray(x, shownInDragDrop)}`));
        }
        if (opts.aggregatorName != null) {
          this.find(".pvtAggregator").val(opts.aggregatorName);
        }
        if (opts.rendererName != null) {
          this.find(".pvtRenderer").val(opts.rendererName);
        }
        if (!opts.showUI) {
          this.find(".pvtUiCell").hide();
        }
        initialRender = true;
        //set up for refreshing
        // Function to calculate complexity heuristics
        calculateComplexity = (subopts) => {
          var complexityScore, estimatedCols, estimatedRows, len3, len4, o, ref4, ref5, ref6, ref7, t, totalRecords, uniqueValues;
          // Count unique values for each attribute
          uniqueValues = {};
          totalRecords = 0;
          // Count records and unique values
          PivotData.forEachRecord(materializedInput, subopts.derivedAttributes, (record) => {
            var len3, len4, o, ref4, ref5, ref6, ref7, results, t;
            if (!subopts.filter(record)) {
              return;
            }
            totalRecords++;
            ref4 = subopts.rows;
            // Count unique values for row attributes
            for (o = 0, len3 = ref4.length; o < len3; o++) {
              attr = ref4[o];
              if (uniqueValues[attr] == null) {
                uniqueValues[attr] = new Set();
              }
              uniqueValues[attr].add((ref5 = record[attr]) != null ? ref5 : "null");
            }
            ref6 = subopts.cols;
            // Count unique values for column attributes
            results = [];
            for (t = 0, len4 = ref6.length; t < len4; t++) {
              attr = ref6[t];
              if (uniqueValues[attr] == null) {
                uniqueValues[attr] = new Set();
              }
              results.push(uniqueValues[attr].add((ref7 = record[attr]) != null ? ref7 : "null"));
            }
            return results;
          });
          // Calculate estimated dimensions
          estimatedRows = 1;
          ref4 = subopts.rows;
          for (o = 0, len3 = ref4.length; o < len3; o++) {
            attr = ref4[o];
            estimatedRows *= ((ref5 = uniqueValues[attr]) != null ? ref5.size : void 0) || 1;
          }
          estimatedCols = 1;
          ref6 = subopts.cols;
          for (t = 0, len4 = ref6.length; t < len4; t++) {
            attr = ref6[t];
            estimatedCols *= ((ref7 = uniqueValues[attr]) != null ? ref7.size : void 0) || 1;
          }
          // Calculate complexity score (rough estimate)
          complexityScore = estimatedRows * estimatedCols;
          return {
            totalRecords: totalRecords,
            estimatedRows: estimatedRows,
            estimatedCols: estimatedCols,
            complexityScore: complexityScore
          };
        };
        refreshDelayed = (first, forceRefresh = false) => {
          var complexity, exclusions, inclusions, len3, newDropdown, numInputsToProcess, o, pivotPromise, pivotUIOptions, pvtUiCell, ref4, ref5, ref6, result, shouldProceed, subopts, t, unusedAttrsContainer, vals, wrapper;
          subopts = {
            derivedAttributes: opts.derivedAttributes,
            localeStrings: opts.localeStrings,
            rendererOptions: opts.rendererOptions,
            sorters: opts.sorters,
            labels: opts.labels,
            cols: [],
            rows: [],
            dataClass: opts.dataClass,
            asyncMode: opts.asyncMode
          };
          numInputsToProcess = (ref4 = opts.aggregators[aggregator.val()]([])().numInputs) != null ? ref4 : 0;
          vals = [];
          this.find(".pvtRows li span.pvtAttr").each(function() {
            return subopts.rows.push($(this).data("attrName"));
          });
          this.find(".pvtCols li span.pvtAttr").each(function() {
            return subopts.cols.push($(this).data("attrName"));
          });
          this.find(".pvtUiControls select.pvtAttrDropdown").each(function() {
            if (numInputsToProcess === 0) {
              $(this).prev(".pvtAttrDropdownBy").remove();
              return $(this).remove();
            } else {
              numInputsToProcess--;
              if ($(this).val() !== "") {
                return vals.push($(this).val());
              }
            }
          });
          if (numInputsToProcess !== 0) {
            pvtUiCell = this.find(".pvtUiControls");
            for (x = o = 0, ref5 = numInputsToProcess; (0 <= ref5 ? o < ref5 : o > ref5); x = 0 <= ref5 ? ++o : --o) {
              newDropdown = $("<select>").addClass('pvtAttrDropdown').append($("<option>")).bind("change", function() {
                return refresh();
              });
              for (t = 0, len3 = shownInAggregators.length; t < len3; t++) {
                attr = shownInAggregators[t];
                newDropdown.append($("<option>").val(attr).text((ref6 = opts.labels[attr]) != null ? ref6 : attr));
              }
              pvtUiCell.append(" ").append($("<span>", {
                class: "pvtAttrDropdownBy"
              }).text(localeStrings.by)).append(" ").append(newDropdown);
            }
          }
          if (initialRender) {
            vals = opts.vals;
            i = 0;
            this.find(".pvtUiControls select.pvtAttrDropdown").each(function() {
              $(this).val(vals[i]);
              return i++;
            });
            initialRender = false;
          }
          subopts.aggregatorName = aggregator.val();
          subopts.vals = vals;
          subopts.aggregator = opts.aggregators[aggregator.val()](vals);
          subopts.renderer = opts.renderers[renderer.val()];
          subopts.rowOrder = rowOrderArrow.data("order");
          subopts.colOrder = colOrderArrow.data("order");
          // Передаем ссылку на UI элемент для автоопределения высоты
          subopts.rendererOptions = $.extend(true, {}, opts.rendererOptions);
          subopts.rendererOptions.pivotUIElement = this[0];
          //construct filter here
          exclusions = {};
          this.find('input.pvtFilter').not(':checked').each(function() {
            var filter;
            filter = $(this).data("filter");
            if (exclusions[filter[0]] != null) {
              return exclusions[filter[0]].push(filter[1]);
            } else {
              return exclusions[filter[0]] = [filter[1]];
            }
          });
          //include inclusions when exclusions present
          inclusions = {};
          this.find('input.pvtFilter:checked').each(function() {
            var filter;
            filter = $(this).data("filter");
            if (exclusions[filter[0]] != null) {
              if (inclusions[filter[0]] != null) {
                return inclusions[filter[0]].push(filter[1]);
              } else {
                return inclusions[filter[0]] = [filter[1]];
              }
            }
          });
          subopts.filter = function(record) {
            var excludedItems, k, ref7, ref8;
            if (!opts.filter(record)) {
              return false;
            }
            for (k in exclusions) {
              excludedItems = exclusions[k];
              if (ref7 = "" + ((ref8 = record[k]) != null ? ref8 : 'null'), indexOf.call(excludedItems, ref7) >= 0) {
                return false;
              }
            }
            return true;
          };
          // Check complexity before proceeding with calculation
          shouldProceed = true;
          if (opts.complexityCallback != null) {
            complexity = calculateComplexity(subopts);
            // Add forced parameter to callback if this is a forced refresh
            if (forceRefresh) {
              // For forced refresh, pass an additional parameter indicating it's forced
              shouldProceed = opts.complexityCallback(complexity, true);
            } else {
              shouldProceed = opts.complexityCallback(complexity);
            }
          }
          if (!shouldProceed) {
            // Show refresh button and display message
            this.find(".pvtRefreshBtn").show();
            pivotTable.html("<div style='text-align: center; padding: 20px; color: #666;'><i class='fas fa-exclamation-triangle'></i><br>Calculation skipped due to complexity.<br>Click refresh button to force calculation.</div>");
            pivotTable.css("opacity", 1);
            return;
          }
          // Hide refresh button if calculation proceeds
          this.find(".pvtRefreshBtn").hide();
          if (subopts.asyncMode) {
            // Show loading indicator
            pivotTable.html("<div class='pvt-loading' style='text-align: center; padding: 20px; color: #666;'><i class='fas fa-spinner fa-spin'></i><br>Processing data...</div>");
            // Store pivot data instance for abort functionality
            this[0].pivotDataInstance = null;
            pivotPromise = (["Line Chart", "Bar Chart", "Stacked Bar Chart", "Area Chart", "Scatter Chart", "Pie Chart"].indexOf(renderer.val()) > -1) ? (({result, wrapper} = pivotTable.pivot(materializedInput, subopts)), result.then(function(tableResult) {
              wrapper.draw(tableResult);
              return tableResult;
            })) : pivotTable.pivot(materializedInput, subopts);
            if ((pivotPromise != null ? pivotPromise.then : void 0) != null) {
              return pivotPromise.then((result) => {
                var pivotUIOptions, unusedAttrsContainer;
                this[0].pivotDataInstance = null;
                pivotTable.empty().append(result);
                pivotUIOptions = $.extend({}, opts, {
                  cols: subopts.cols,
                  rows: subopts.rows,
                  colOrder: subopts.colOrder,
                  rowOrder: subopts.rowOrder,
                  vals: vals,
                  exclusions: exclusions,
                  inclusions: inclusions,
                  inclusionsInfo: inclusions, //duplicated for backwards-compatibility
                  aggregatorName: aggregator.val(),
                  rendererName: renderer.val()
                });
                this.data("pivotUIOptions", pivotUIOptions);
                // if requested make sure unused columns are in alphabetical order
                if (opts.autoSortUnusedAttrs) {
                  unusedAttrsContainer = this.find("td.pvtUnused.pvtAxisContainer");
                  $(unusedAttrsContainer).children("li").sort((a, b) => {
                    return naturalSort($(a).text(), $(b).text());
                  }).appendTo(unusedAttrsContainer);
                }
                pivotTable.css("opacity", 1);
                if ((opts.onRefresh != null) && (first == null)) {
                  return opts.onRefresh(pivotUIOptions);
                }
              }).catch((error) => {
                this[0].pivotDataInstance = null;
                console.error("Pivot table error:", error);
                pivotTable.html(`<div style='text-align: center; padding: 20px; color: #d9534f;'><i class='fas fa-exclamation-triangle'></i><br>Error processing data:<br>${error.message}</div>`);
                return pivotTable.css("opacity", 1);
              });
            }
          } else {
            // Synchronous mode - original behavior
            if (["Line Chart", "Bar Chart", "Stacked Bar Chart", "Area Chart", "Scatter Chart", "Pie Chart"].indexOf(renderer.val()) > -1) {
              ({result, wrapper} = pivotTable.pivot(materializedInput, subopts));
              pivotTable.append(result);
              wrapper.draw(result[0]);
            } else {
              pivotTable.append(pivotTable.pivot(materializedInput, subopts));
            }
            pivotUIOptions = $.extend({}, opts, {
              cols: subopts.cols,
              rows: subopts.rows,
              colOrder: subopts.colOrder,
              rowOrder: subopts.rowOrder,
              vals: vals,
              exclusions: exclusions,
              inclusions: inclusions,
              inclusionsInfo: inclusions, //duplicated for backwards-compatibility
              aggregatorName: aggregator.val(),
              rendererName: renderer.val()
            });
            this.data("pivotUIOptions", pivotUIOptions);
            // if requested make sure unused columns are in alphabetical order
            if (opts.autoSortUnusedAttrs) {
              unusedAttrsContainer = this.find("td.pvtUnused.pvtAxisContainer");
              $(unusedAttrsContainer).children("li").sort((a, b) => {
                return naturalSort($(a).text(), $(b).text());
              }).appendTo(unusedAttrsContainer);
            }
            pivotTable.css("opacity", 1);
            if ((opts.onRefresh != null) && (first == null)) {
              return opts.onRefresh(pivotUIOptions);
            }
          }
        };
        refresh = (first, forceRefresh = false) => {
          pivotTable.css("opacity", 0.5);
          return setTimeout((function() {
            return refreshDelayed(first, forceRefresh);
          }), 10);
        };
        //the very first refresh will actually display the table
        refresh(true, false);
        this.find(".pvtAxisContainer").sortable({
          update: function(e, ui) {
            if (ui.sender == null) {
              return refresh();
            }
          },
          connectWith: this.find(".pvtAxisContainer"),
          items: 'li',
          placeholder: 'pvtPlaceholder'
        });
      } catch (error1) {
        // $(".pvtUi .pvtRows, .pvtUi .pvtUnused").resizable({
        //     handles: "e",
        //     resize: (event, ui) ->
        //         if ui.size.width > 150
        //             event.target.style.maxWidth = ui.size.width + 'px'
        // })
        e = error1;
        if (typeof console !== "undefined" && console !== null) {
          console.error(e.stack);
        }
        this.html(opts.localeStrings.uiRenderError);
      }
      return this;
    };
    /*
    Heatmap post-processing
    */
    $.fn.heatmap = function(scope = "heatmap", opts) {
      var colorScaleGenerator, heatmapper, i, j, l, n, numCols, numRows, ref, ref1, ref2;
      numRows = this.data("numrows");
      numCols = this.data("numcols");
      // given a series of values
      // must return a function to map a given value to a CSS color
      colorScaleGenerator = opts != null ? (ref = opts.heatmap) != null ? ref.colorScaleGenerator : void 0 : void 0;
      if (colorScaleGenerator == null) {
        colorScaleGenerator = function(values) {
          var max, min;
          min = Math.min(...values);
          max = Math.max(...values);
          return function(x) {
            var nonRed;
            nonRed = 255 - Math.round(255 * (x - min) / (max - min));
            return `rgb(255,${nonRed},${nonRed})`;
          };
        };
      }
      heatmapper = (scope) => {
        var colorScale, forEachCell, values;
        forEachCell = (f) => {
          return this.find(scope).each(function() {
            var x;
            x = $(this).data("value");
            if ((x != null) && isFinite(x)) {
              return f(x, $(this));
            }
          });
        };
        values = [];
        forEachCell(function(x) {
          return values.push(x);
        });
        colorScale = colorScaleGenerator(values);
        return forEachCell(function(x, elem) {
          return elem.css("background-color", colorScale(x));
        });
      };
      switch (scope) {
        case "heatmap":
          heatmapper(".pvtVal");
          break;
        case "rowheatmap":
          for (i = l = 0, ref1 = numRows; (0 <= ref1 ? l < ref1 : l > ref1); i = 0 <= ref1 ? ++l : --l) {
            heatmapper(`.pvtVal.row${i}`);
          }
          break;
        case "colheatmap":
          for (j = n = 0, ref2 = numCols; (0 <= ref2 ? n < ref2 : n > ref2); j = 0 <= ref2 ? ++n : --n) {
            heatmapper(`.pvtVal.col${j}`);
          }
      }
      heatmapper(".pvtTotal.rowTotal");
      heatmapper(".pvtTotal.colTotal");
      return this;
    };
    /*
    Barchart post-processing
    */
    $.fn.barchart = function(opts) {
      var barcharter, i, l, numCols, numRows, ref;
      numRows = this.data("numrows");
      numCols = this.data("numcols");
      barcharter = (scope) => {
        var forEachCell, max, min, range, scaler, values;
        forEachCell = (f) => {
          return this.find(scope).each(function() {
            var x;
            x = $(this).data("value");
            if ((x != null) && isFinite(x)) {
              return f(x, $(this));
            }
          });
        };
        values = [];
        forEachCell(function(x) {
          return values.push(x);
        });
        max = Math.max(...values);
        if (max < 0) {
          max = 0;
        }
        range = max;
        min = Math.min(...values);
        if (min < 0) {
          range = max - min;
        }
        scaler = function(x) {
          return 100 * x / (1.4 * range);
        };
        return forEachCell(function(x, elem) {
          var bBase, bgColor, text, wrapper;
          text = elem.text();
          wrapper = $("<div>").css({
            "position": "relative",
            "height": "55px"
          });
          bgColor = "gray";
          bBase = 0;
          if (min < 0) {
            bBase = scaler(-min);
          }
          if (x < 0) {
            bBase += scaler(x);
            bgColor = "darkred";
            x = -x;
          }
          wrapper.append($("<div>").css({
            "position": "absolute",
            "bottom": bBase + "%",
            "left": 0,
            "right": 0,
            "height": scaler(x) + "%",
            "background-color": bgColor
          }));
          wrapper.append($("<div>").text(text).css({
            "position": "relative",
            "padding-left": "5px",
            "padding-right": "5px"
          }));
          return elem.css({
            "padding": 0,
            "padding-top": "5px",
            "text-align": "center"
          }).html(wrapper);
        });
      };
      for (i = l = 0, ref = numRows; (0 <= ref ? l < ref : l > ref); i = 0 <= ref ? ++l : --l) {
        barcharter(`.pvtVal.row${i}`);
      }
      barcharter(".pvtTotal.colTotal");
      return this;
    };
    return pivotTableRendererVirtualized = function(pivotData, opts) {
      var aborted, applyExistingColumnWidths, applyWidthsToAllSections, applyWidthsToDataRows, applyWidthsToFooter, applyWidthsToHeaders, availableHeight, bufferSize, buildFooter, buildHeaders, calculateTotalColumns, calculateVisibleRange, callLifecycle, colAttrs, colKeys, columnWidths, columnWidthsMeasured, container, containerHeight, createDataRow, currentEndIndex, currentStartIndex, defaults, estimatedVisibleRows, getClickHandler, headerHeight, isUpdatingRows, mainTable, measureAndApplyColumnWidths, pivotTableElement, pivotUIElement, pivotUIHeight, rowAttrs, rowHeight, rowKeys, setupScrollHandler, shouldVirtualize, spanSize, startTime, tableAreaTop, tbody, totalColumns, totalRows, uiAreaTop, updateVisibleRows, usedHeight;
      defaults = {
        table: {
          clickCallback: null,
          rowTotals: true,
          colTotals: true,
          virtualization: {
            enabled: false,
            rowHeight: 30,
            bufferSize: 5, // количество строк буфера сверху и снизу
            containerHeight: 400, // высота контейнера таблицы
            autoHeight: false // Автоматически определять высоту на основе pvtUi
          }
        },
        localeStrings: {
          totals: "Totals"
        },
        lifecycleCallback: null
      };
      opts = $.extend(true, {}, defaults, opts);
      // Автоопределение высоты контейнера
      if (opts.table.virtualization.autoHeight) {
        // Пытаемся найти родительский элемент pvtUi
        pivotUIElement = opts.pivotUIElement;
        // Если не передан через опции, ищем в DOM
        if (!pivotUIElement && typeof $ !== 'undefined') {
          pivotUIElement = $(".pvtUi").first()[0];
        }
        if (pivotUIElement) {
          // Определяем доступную высоту
          pivotUIHeight = pivotUIElement.clientHeight || pivotUIElement.offsetHeight;
          // Если высота еще не определилась (элемент не отрисован), используем viewport
          if (pivotUIHeight <= 0 && typeof window !== 'undefined') {
            pivotUIHeight = window.innerHeight || 600;
          }
          // Находим таблицу внутри UI для более точного расчета
          pivotTableElement = null;
          if (typeof $ !== 'undefined') {
            pivotTableElement = $(pivotUIElement).find('.pvtTable, .pvtRendererArea').first()[0];
          }
          if (pivotTableElement) {
            // Определяем высоту области для таблицы
            if (pivotTableElement.getBoundingClientRect) {
              tableAreaTop = pivotTableElement.getBoundingClientRect().top || 0;
              uiAreaTop = pivotUIElement.getBoundingClientRect ? pivotUIElement.getBoundingClientRect().top : 0;
              usedHeight = tableAreaTop - uiAreaTop + 50; // добавляем отступ
            } else {
              usedHeight = 120;
            }
          } else {
            // Приблизительный расчет: контролы + отступы
            usedHeight = 120;
          }
          // Вычисляем доступную высоту
          availableHeight = Math.max(200, pivotUIHeight - usedHeight);
          opts.table.virtualization.containerHeight = availableHeight;
        }
      }
      aborted = false;
      startTime = Date.now();
      callLifecycle = function(stage, progress, metadata = null) {
        var abortFn, data, toggleVirtualizationFn;
        if (opts.lifecycleCallback == null) {
          return;
        }
        data = {
          stage: stage,
          progress: progress,
          elapsedTime: Date.now() - startTime,
          totalRows: metadata != null ? metadata.totalRows : void 0,
          totalCols: metadata != null ? metadata.totalCols : void 0,
          isVirtualized: true,
          domElements: metadata != null ? metadata.domElements : void 0,
          currentIndex: metadata != null ? metadata.currentIndex : void 0,
          endIndex: metadata != null ? metadata.endIndex : void 0
        };
        abortFn = null;
        if (stage === 'render-started' || stage === 'render-progress') {
          abortFn = function() {
            return aborted = true;
          };
        }
        toggleVirtualizationFn = null;
        if (stage === 'render-started') {
          toggleVirtualizationFn = function(enabled) {
            return opts.table.virtualization.enabled = enabled;
          };
        }
        return opts.lifecycleCallback(data, abortFn, toggleVirtualizationFn);
      };
      colAttrs = pivotData.colAttrs;
      rowAttrs = pivotData.rowAttrs;
      rowKeys = pivotData.getRowKeys();
      colKeys = pivotData.getColKeys();
      totalRows = rowKeys.length;
      // Calculate estimated visible rows if virtualization is enabled
      estimatedVisibleRows = totalRows;
      if (opts.table.virtualization.enabled) {
        containerHeight = opts.table.virtualization.containerHeight || 500;
        rowHeight = opts.table.virtualization.rowHeight || 30;
        bufferSize = opts.table.virtualization.bufferSize || 5;
        headerHeight = 50; // estimated header height
        // Formula from calculateVisibleRange: Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize)
        estimatedVisibleRows = Math.min(totalRows, Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize));
      }
      callLifecycle('render-started', 0, {
        totalRows: totalRows,
        totalCols: colKeys.length,
        domElements: 0,
        estimatedVisibleRows: estimatedVisibleRows
      });
      if (aborted) {
        return;
      }
      shouldVirtualize = opts.table.virtualization.enabled;
      if (!shouldVirtualize) {
        return pivotTableRenderer(pivotData, opts);
      }
      container = document.createElement("div");
      container.className = "pvt-virtualized-container";
      container.style.cssText = `position: relative;
height: ${opts.table.virtualization.containerHeight}px;
overflow: auto;
border: 1px solid #ccc;
background: white;`;
      mainTable = document.createElement("table");
      mainTable.className = "pvtTable pvt-virtualized-table";
      // Добавляем CSS правила для предотвращения сбоев layout
      // mainTable.style.cssText = """
      //     table-layout: fixed;
      //     width: 100%;
      //     border-collapse: collapse;
      // """
      container.appendChild(mainTable);
      // Variables for synchronizing column widths
      columnWidths = [];
      totalColumns = 0;
      isUpdatingRows = false; // Flag to prevent update conflicts
      columnWidthsMeasured = false; // Flag to measure widths only once
      if (opts.table.clickCallback) {
        getClickHandler = function(value, rowValues, colValues) {
          var attr, filters, i;
          filters = {};
          for (i in colAttrs) {
            if (!hasProp.call(colAttrs, i)) continue;
            attr = colAttrs[i];
            if (colValues[i] != null) {
              filters[attr] = colValues[i];
            }
          }
          for (i in rowAttrs) {
            if (!hasProp.call(rowAttrs, i)) continue;
            attr = rowAttrs[i];
            if (rowValues[i] != null) {
              filters[attr] = rowValues[i];
            }
          }
          return function(e) {
            return opts.table.clickCallback(e, value, filters, pivotData);
          };
        };
      }
      spanSize = function(arr, i, j, virtualStartIndex = 0) {
        var l, len, n, noDraw, o, ref, ref1, ref2, stop, x;
        // В виртуализированном режиме нужно учитывать, что предыдущие строки могут быть не отрисованы
        // Если это первая видимая строка в виртуализированном окне, всегда показываем заголовки
        if (i === virtualStartIndex) {
          len = 1;
          while (i + len < arr.length) {
            stop = false;
            for (x = l = 0, ref = j; (0 <= ref ? l <= ref : l >= ref); x = 0 <= ref ? ++l : --l) {
              if (arr[i][x] !== arr[i + len][x]) {
                stop = true;
              }
            }
            if (stop) {
              break;
            }
            len++;
          }
          return len;
        }
        if (i !== 0 && i > virtualStartIndex) {
          noDraw = true;
          for (x = n = 0, ref1 = j; (0 <= ref1 ? n <= ref1 : n >= ref1); x = 0 <= ref1 ? ++n : --n) {
            if (arr[i - 1][x] !== arr[i][x]) {
              noDraw = false;
            }
          }
          if (noDraw) {
            return -1;
          }
        }
        len = 0;
        while (i + len < arr.length) {
          stop = false;
          for (x = o = 0, ref2 = j; (0 <= ref2 ? o <= ref2 : o >= ref2); x = 0 <= ref2 ? ++o : --o) {
            if (arr[i][x] !== arr[i + len][x]) {
              stop = true;
            }
          }
          if (stop) {
            break;
          }
          len++;
        }
        return len;
      };
      calculateTotalColumns = function() {
        var totalCols;
        totalCols = rowAttrs.length;
        if (colAttrs.length > 0) {
          totalCols += 1; // for "attribute" column
        }
        totalCols += colKeys.length; // for data column
        if (opts.table.rowTotals) {
          totalCols += 1; // total column
        }
        return totalCols;
      };
      measureAndApplyColumnWidths = function() {
        var cell, cells, dataRow, i, l, len1, newColumnWidths, originalStyle, rect, width;
        // Measure widths only once to avoid accumulating changes
        if (columnWidthsMeasured) {
          return;
        }
        // Find a data row for measurement (not a spacer)
        dataRow = mainTable.querySelector('tbody tr:not(.pvt-virtual-spacer-top):not(.pvt-virtual-spacer-bottom)');
        if (!dataRow) {
          return;
        }
        cells = dataRow.querySelectorAll('th, td');
        if (cells.length === 0) {
          return;
        }
        // Measure the natural width of each cell (without forcing the width)
        newColumnWidths = [];
        for (i = l = 0, len1 = cells.length; l < len1; i = ++l) {
          cell = cells[i];
          // Temporarily remove set widths to get the natural size
          originalStyle = cell.style.cssText;
          cell.style.width = 'auto';
          cell.style.minWidth = 'auto';
          cell.style.maxWidth = 'none';
          rect = cell.getBoundingClientRect();
          width = Math.max(rect.width, 80); // min 80px
          newColumnWidths.push(width);
          // Restore the style
          cell.style.cssText = originalStyle;
        }
        columnWidths = newColumnWidths;
        columnWidthsMeasured = true;
        return applyWidthsToAllSections();
      };
      // Function to apply already measured column widths to new rows
      applyExistingColumnWidths = function() {
        if (columnWidths.length === 0) {
          return;
        }
        applyWidthsToDataRows();
        // Также повторно применяем ширины к заголовкам для устранения сбоев
        return applyWidthsToHeaders();
      };
      // Apply widths to all sections of the table
      applyWidthsToAllSections = function() {
        if (columnWidths.length === 0) {
          return;
        }
        applyWidthsToHeaders();
        applyWidthsToFooter();
        return applyWidthsToDataRows();
      };
      applyWidthsToDataRows = function() {
        var cell, cells, dataRow, dataRows, i, l, len1, results;
        if (columnWidths.length === 0) {
          return;
        }
        dataRows = mainTable.querySelectorAll('tbody tr:not(.pvt-virtual-spacer-top):not(.pvt-virtual-spacer-bottom)');
        results = [];
        for (l = 0, len1 = dataRows.length; l < len1; l++) {
          dataRow = dataRows[l];
          cells = dataRow.querySelectorAll('th, td');
          results.push((function() {
            var len2, n, results1;
            results1 = [];
            for (i = n = 0, len2 = cells.length; n < len2; i = ++n) {
              cell = cells[i];
              if (columnWidths[i] != null) {
                // Используем !important для предотвращения сбоев layout при виртуализации
                // cell.style.cssText = "#{cell.style.cssText}; width: #{columnWidths[i]}px !important; min-width: #{columnWidths[i]}px !important; max-width: #{columnWidths[i]}px !important;"
                cell.style.width = `${columnWidths[i]}px`;
                cell.style.minWidth = `${columnWidths[i]}px`;
                results1.push(cell.style.maxWidth = `${columnWidths[i]}px`);
              } else {
                results1.push(void 0);
              }
            }
            return results1;
          })());
        }
        return results;
      };
      applyWidthsToHeaders = function() {
        var actualColumnIndex, cell, cellIndex, cells, colspan, dataColumnIndex, hasTotalColumn, headerRow, headerRows, i, l, len1, numDataColumns, numRowHeaders, results, rowIndex, totalColumnIndex, totalDataWidth, totalRowHeaderWidth, totalWidth, width;
        if (columnWidths.length === 0) {
          return;
        }
        // Data columns struct: [rowHeaders...] [dataColumns...] [totalColumn?]
        numRowHeaders = rowAttrs.length;
        numDataColumns = colKeys.length;
        hasTotalColumn = opts.table.rowTotals || colAttrs.length === 0;
        // Apply to headers row by row
        headerRows = mainTable.querySelectorAll('thead tr');
        results = [];
        for (rowIndex = l = 0, len1 = headerRows.length; l < len1; rowIndex = ++l) {
          headerRow = headerRows[rowIndex];
          cells = headerRow.querySelectorAll('th');
          dataColumnIndex = 0; // Index in columnWidths array
          results.push((function() {
            var len2, n, o, ref, ref1, ref2, ref3, results1, t, u;
            results1 = [];
            for (cellIndex = n = 0, len2 = cells.length; n < len2; cellIndex = ++n) {
              cell = cells[cellIndex];
              colspan = parseInt(cell.getAttribute('colspan')) || 1;
              if (cellIndex === 0 && colspan === numRowHeaders && rowIndex === 0) {
                // First merged cell for row headers
                totalRowHeaderWidth = 0;
                for (i = o = 0, ref = numRowHeaders; (0 <= ref ? o < ref : o > ref); i = 0 <= ref ? ++o : --o) {
                  totalRowHeaderWidth += columnWidths[i] || 100;
                }
                // Принудительно применяем стиль для предотвращения сбоев layout
                // cell.style.cssText = "#{cell.style.cssText}; width: #{totalRowHeaderWidth}px !important; min-width: #{totalRowHeaderWidth}px !important; max-width: #{totalRowHeaderWidth}px !important;"
                cell.style.width = `${totalRowHeaderWidth}px`;
                cell.style.minWidth = `${totalRowHeaderWidth}px`;
                results1.push(cell.style.maxWidth = `${totalRowHeaderWidth}px`);
              } else if (cell.classList.contains('pvtAxisLabel')) {
                if (dataColumnIndex < numRowHeaders) {
                  // Column rows attributes
                  width = columnWidths[dataColumnIndex] || 100;
                  // cell.style.cssText = "#{cell.style.cssText}; width: #{width}px !important; min-width: #{width}px !important; max-width: #{width}px !important;"
                  cell.style.width = `${width}px`;
                  cell.style.minWidth = `${width}px`;
                  cell.style.maxWidth = `${width}px`;
                  results1.push(dataColumnIndex++);
                } else {
                  // Column attribute header - spans all data columns
                  totalDataWidth = 0;
                  for (i = t = ref1 = numRowHeaders, ref2 = numRowHeaders + numDataColumns; (ref1 <= ref2 ? t < ref2 : t > ref2); i = ref1 <= ref2 ? ++t : --t) {
                    totalDataWidth += columnWidths[i] || 80;
                  }
                  // cell.style.cssText = "#{cell.style.cssText}; width: #{totalDataWidth}px !important; min-width: #{totalDataWidth}px !important; max-width: #{totalDataWidth}px !important;"
                  cell.style.width = `${totalDataWidth}px`;
                  cell.style.minWidth = `${totalDataWidth}px`;
                  results1.push(cell.style.maxWidth = `${totalDataWidth}px`);
                }
              } else if (cell.classList.contains('pvtColLabel')) {
                // Data column headers
                actualColumnIndex = numRowHeaders + dataColumnIndex;
                if (colspan === 1) {
                  width = columnWidths[actualColumnIndex] || 80;
                  // cell.style.cssText = "#{cell.style.cssText}; width: #{width}px !important; min-width: #{width}px !important; max-width: #{width}px !important;"
                  cell.style.width = `${width}px`;
                  cell.style.minWidth = `${width}px`;
                  cell.style.maxWidth = `${width}px`;
                  results1.push(dataColumnIndex++);
                } else {
                  // Merged cell for data columns
                  totalWidth = 0;
                  for (i = u = 0, ref3 = colspan; (0 <= ref3 ? u < ref3 : u > ref3); i = 0 <= ref3 ? ++u : --u) {
                    totalWidth += columnWidths[actualColumnIndex + i] || 80;
                  }
                  // cell.style.cssText = "#{cell.style.cssText}; width: #{totalWidth}px !important; min-width: #{totalWidth}px !important; max-width: #{totalWidth}px !important;"
                  cell.style.width = `${totalWidth}px`;
                  cell.style.minWidth = `${totalWidth}px`;
                  cell.style.maxWidth = `${totalWidth}px`;
                  results1.push(dataColumnIndex += colspan);
                }
              } else if (cell.classList.contains('pvtTotalLabel')) {
                if (hasTotalColumn) {
                  totalColumnIndex = numRowHeaders + numDataColumns;
                  width = columnWidths[totalColumnIndex] || 80;
                  // cell.style.cssText = "#{cell.style.cssText}; width: #{width}px !important; min-width: #{width}px !important; max-width: #{width}px !important;"
                  cell.style.width = `${width}px`;
                  cell.style.minWidth = `${width}px`;
                  results1.push(cell.style.maxWidth = `${width}px`);
                } else {
                  results1.push(void 0);
                }
              } else {
                results1.push(void 0);
              }
            }
            return results1;
          })());
        }
        return results;
      };
      // Applying widths to the totals row in tfoot - matches the data structure exactly
      applyWidthsToFooter = function() {
        var cell, cells, footerRow, i, l, len1, results;
        if (columnWidths.length === 0) {
          return;
        }
        footerRow = mainTable.querySelector('tfoot tr');
        if (!footerRow) {
          return;
        }
        cells = footerRow.querySelectorAll('th, td');
        results = [];
        for (i = l = 0, len1 = cells.length; l < len1; i = ++l) {
          cell = cells[i];
          if (columnWidths[i] != null) {
            // Используем !important для предотвращения сбоев layout
            // cell.style.cssText = "#{cell.style.cssText}; width: #{columnWidths[i]}px !important; min-width: #{columnWidths[i]}px !important; max-width: #{columnWidths[i]}px !important;"
            cell.style.width = `${columnWidths[i]}px`;
            cell.style.minWidth = `${columnWidths[i]}px`;
            results.push(cell.style.maxWidth = `${columnWidths[i]}px`);
          } else {
            results.push(void 0);
          }
        }
        return results;
      };
      buildHeaders = function() {
        var c, colKey, i, j, r, ref, ref1, ref2, ref3, th, thead, tr, x;
        thead = document.createElement("thead");
        for (j in colAttrs) {
          if (!hasProp.call(colAttrs, j)) continue;
          c = colAttrs[j];
          tr = document.createElement("tr");
          if (parseInt(j) === 0 && rowAttrs.length !== 0) {
            th = document.createElement("th");
            th.setAttribute("colspan", rowAttrs.length);
            th.setAttribute("rowspan", colAttrs.length);
            th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;";
            tr.appendChild(th);
          }
          th = document.createElement("th");
          th.className = "pvtAxisLabel";
          th.textContent = (ref = (ref1 = opts.labels) != null ? ref1[c] : void 0) != null ? ref : c;
          th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;";
          tr.appendChild(th);
          for (i in colKeys) {
            if (!hasProp.call(colKeys, i)) continue;
            colKey = colKeys[i];
            x = spanSize(colKeys, parseInt(i), parseInt(j));
            if (x !== -1) {
              th = document.createElement("th");
              th.className = "pvtColLabel";
              th.textContent = colKey[j];
              th.setAttribute("colspan", x);
              th.style.cssText = "background: #f0f0f0; border: 1px solid #ccc; padding: 5px; text-align: center; white-space: nowrap; min-width: 80px;";
              if (parseInt(j) === colAttrs.length - 1 && rowAttrs.length !== 0) {
                th.setAttribute("rowspan", 2);
              }
              tr.appendChild(th);
            }
          }
          if (parseInt(j) === 0 && opts.table.rowTotals) {
            th = document.createElement("th");
            th.className = "pvtTotalLabel pvtRowTotalLabel";
            th.innerHTML = opts.localeStrings.totals;
            th.setAttribute("rowspan", colAttrs.length + (rowAttrs.length === 0 ? 0 : 1));
            th.style.cssText = "background: #e6e6e6; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap; min-width: 80px;";
            tr.appendChild(th);
          }
          thead.appendChild(tr);
        }
        if (rowAttrs.length !== 0) {
          tr = document.createElement("tr");
          for (i in rowAttrs) {
            if (!hasProp.call(rowAttrs, i)) continue;
            r = rowAttrs[i];
            th = document.createElement("th");
            th.className = "pvtAxisLabel";
            th.textContent = (ref2 = (ref3 = opts.labels) != null ? ref3[r] : void 0) != null ? ref2 : r;
            th.style.cssText = "background: #f5f5f5; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap; min-width: 100px;";
            tr.appendChild(th);
          }
          th = document.createElement("th");
          if (colAttrs.length === 0) {
            th.className = "pvtTotalLabel pvtRowTotalLabel";
            th.innerHTML = opts.localeStrings.totals;
          }
          th.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: center; white-space: nowrap;";
          tr.appendChild(th);
          thead.appendChild(tr);
        }
        return mainTable.appendChild(thead);
      };
      buildFooter = function() {
        var colKey, j, td, tfoot, th, totalAggregator, tr, val;
        if (!(opts.table.colTotals || rowAttrs.length === 0)) {
          return;
        }
        tfoot = document.createElement("tfoot");
        tr = document.createElement("tr");
        tr.className = "pvt-totals-row";
        tr.style.cssText = "background: #f9f9f9; border-top: 2px solid #999; font-weight: bold;";
        if (opts.table.colTotals || rowAttrs.length === 0) {
          th = document.createElement("th");
          th.className = "pvtTotalLabel pvtColTotalLabel";
          th.innerHTML = opts.localeStrings.totals;
          th.setAttribute("colspan", rowAttrs.length + (colAttrs.length === 0 ? 0 : 1));
          th.style.cssText = "background: #e6e6e6; border: 1px solid #ccc; padding: 5px; text-align: center; font-weight: bold; white-space: nowrap;";
          tr.appendChild(th);
        }
        for (j in colKeys) {
          if (!hasProp.call(colKeys, j)) continue;
          colKey = colKeys[j];
          totalAggregator = pivotData.getAggregator([], colKey);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal colTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #f9f9f9; color: #000; white-space: nowrap; min-width: 80px;";
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], colKey);
          }
          td.setAttribute("data-for", "col" + j);
          tr.appendChild(td);
        }
        if (opts.table.rowTotals || colAttrs.length === 0) {
          totalAggregator = pivotData.getAggregator([], []);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtGrandTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #e6e6e6; color: #000; white-space: nowrap; min-width: 80px;";
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, [], []);
          }
          tr.appendChild(td);
        }
        tfoot.appendChild(tr);
        return mainTable.appendChild(tfoot);
      };
      createDataRow = function(i, rowKey, virtualStartIndex = 0) {
        var aggregator, colKey, j, td, th, totalAggregator, tr, txt, val, x;
        tr = document.createElement("tr");
        tr.setAttribute("data-row-index", i);
        tr.style.height = `${opts.table.virtualization.rowHeight}px`;
        for (j in rowKey) {
          if (!hasProp.call(rowKey, j)) continue;
          txt = rowKey[j];
          x = spanSize(rowKeys, parseInt(i), parseInt(j), virtualStartIndex);
          if (x !== -1) {
            th = document.createElement("th");
            th.className = "pvtRowLabel";
            th.textContent = txt;
            th.setAttribute("rowspan", x);
            th.style.cssText = "background: #f8f8f8; border: 1px solid #ccc; padding: 5px; text-align: left; font-weight: normal; white-space: nowrap; min-width: 100px;";
            if (parseInt(j) === rowAttrs.length - 1 && colAttrs.length !== 0) {
              th.setAttribute("colspan", 2);
            }
            tr.appendChild(th);
          }
        }
        for (j in colKeys) {
          if (!hasProp.call(colKeys, j)) continue;
          colKey = colKeys[j];
          aggregator = pivotData.getAggregator(rowKey, colKey);
          val = aggregator.value();
          td = document.createElement("td");
          td.className = `pvtVal row${i} col${j}`;
          td.textContent = aggregator.format(val);
          td.setAttribute("data-value", val);
          td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; color: #3D3D3D; white-space: nowrap; min-width: 80px;";
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, colKey);
          }
          tr.appendChild(td);
        }
        if (opts.table.rowTotals || colAttrs.length === 0) {
          totalAggregator = pivotData.getAggregator(rowKey, []);
          val = totalAggregator.value();
          td = document.createElement("td");
          td.className = "pvtTotal rowTotal";
          td.textContent = totalAggregator.format(val);
          td.setAttribute("data-value", val);
          td.style.cssText = "border: 1px solid #ccc; padding: 5px; text-align: right; font-weight: bold; background: #f9f9f9; color: #000; white-space: nowrap; min-width: 80px;";
          if (getClickHandler != null) {
            td.onclick = getClickHandler(val, rowKey, []);
          }
          td.setAttribute("data-for", `row${i}`);
          tr.appendChild(td);
        }
        return tr;
      };
      currentStartIndex = 0;
      currentEndIndex = 0;
      calculateVisibleRange = function() {
        var adjustedScrollTop, endIndex, maxScrollTop, ref, scrollTop, startIndex, visibleRows;
        scrollTop = container.scrollTop;
        containerHeight = opts.table.virtualization.containerHeight;
        rowHeight = opts.table.virtualization.rowHeight;
        bufferSize = opts.table.virtualization.bufferSize;
        headerHeight = ((ref = mainTable.querySelector('thead')) != null ? ref.clientHeight : void 0) || 0;
        adjustedScrollTop = Math.max(0, scrollTop - headerHeight);
        startIndex = Math.max(0, Math.floor(adjustedScrollTop / rowHeight) - bufferSize);
        visibleRows = Math.ceil((containerHeight - headerHeight) / rowHeight) + (2 * bufferSize);
        endIndex = Math.min(totalRows, startIndex + visibleRows);
        // Boundary check to prevent jitter
        maxScrollTop = Math.max(0, (totalRows * rowHeight) - (containerHeight - headerHeight));
        if (scrollTop >= maxScrollTop) {
          // If reached the end, fix endIndex at the maximum value
          endIndex = totalRows;
          startIndex = Math.max(0, endIndex - visibleRows + bufferSize);
        }
        return {startIndex, endIndex};
      };
      updateVisibleRows = function() {
        var bottomSpacer, endIndex, i, l, ref, ref1, remainingRows, row, rowKey, spacerTd, startIndex, tbody, topSpacer;
        if (isUpdatingRows) {
          return;
        }
        ({startIndex, endIndex} = calculateVisibleRange());
        if (startIndex === currentStartIndex && endIndex === currentEndIndex) {
          return;
        }
        isUpdatingRows = true;
        callLifecycle('render-progress', (endIndex / totalRows) * 100, {
          totalRows: totalRows,
          totalCols: colKeys.length,
          domElements: container.querySelectorAll('*').length,
          currentIndex: startIndex,
          endIndex: endIndex
        });
        // console.log("Virtualization: showing rows #{startIndex}-#{endIndex} of #{totalRows} total")
        tbody = mainTable.querySelector('tbody');
        if (!tbody) {
          tbody = document.createElement('tbody');
          mainTable.appendChild(tbody);
        }
        tbody.innerHTML = '';
        rowHeight = opts.table.virtualization.rowHeight;
        if (startIndex > 0) {
          topSpacer = document.createElement('tr');
          topSpacer.className = 'pvt-virtual-spacer-top';
          spacerTd = document.createElement('td');
          spacerTd.style.cssText = `height: ${startIndex * rowHeight}px;
padding: 0;
border: none;
background: transparent;`;
          spacerTd.setAttribute('colspan', '999');
          topSpacer.appendChild(spacerTd);
          tbody.appendChild(topSpacer);
        }
        for (i = l = ref = startIndex, ref1 = endIndex; (ref <= ref1 ? l < ref1 : l > ref1); i = ref <= ref1 ? ++l : --l) {
          if (i < rowKeys.length) {
            rowKey = rowKeys[i];
            row = createDataRow(i, rowKey, startIndex);
            tbody.appendChild(row);
          }
        }
        remainingRows = totalRows - endIndex;
        if (remainingRows > 0) {
          bottomSpacer = document.createElement('tr');
          bottomSpacer.className = 'pvt-virtual-spacer-bottom';
          spacerTd = document.createElement('td');
          spacerTd.style.cssText = `height: ${remainingRows * rowHeight}px;
padding: 0;
border: none;
background: transparent;`;
          spacerTd.setAttribute('colspan', '999');
          bottomSpacer.appendChild(spacerTd);
          tbody.appendChild(bottomSpacer);
        }
        currentStartIndex = startIndex;
        currentEndIndex = endIndex;
        // Measure and apply column widths only during the first render
        if (!columnWidthsMeasured) {
          return setTimeout(function() {
            measureAndApplyColumnWidths();
            return isUpdatingRows = false;
          }, 10);
        } else {
          // Apply already measured column widths to new rows
          return setTimeout(function() {
            applyExistingColumnWidths();
            return isUpdatingRows = false;
          }, 5);
        }
      };
      setupScrollHandler = function() {
        var scrollTimeout;
        scrollTimeout = null;
        return container.addEventListener('scroll', function() {
          if (scrollTimeout) {
            clearTimeout(scrollTimeout);
          }
          return scrollTimeout = setTimeout(updateVisibleRows, 16); // ~60fps
        });
      };
      tbody = document.createElement('tbody');
      mainTable.appendChild(tbody);
      totalColumns = calculateTotalColumns();
      buildHeaders();
      // Add totals to the footer of the main table
      if (opts.table.colTotals) {
        buildFooter();
      }
      setupScrollHandler();
      updateVisibleRows();
      callLifecycle('render-completed', 100, {
        totalRows: rowKeys.length,
        totalCols: colKeys.length,
        isVirtualized: shouldVirtualize,
        domElements: container.querySelectorAll('*').length
      });
      return container;
    };
  });

}).call(this);

//# sourceMappingURL=pivot.js.map
