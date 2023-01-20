import {
  Component,
  Element,
  Event,
  EventEmitter,
  h,
  Host,
  Method,
  Prop,
  State,
  Watch
} from "@stencil/core";
import { announce } from "@react-aria/live-announcer";

import { getISODateString, removeTimezoneOffset } from "../../utils/utils";
import { MonthChangedEventDetails } from "../inclusive-dates-calendar/inclusive-dates-calendar";
import {
  ChronoOptions,
  ChronoParsedDateString
} from "../../utils/chrono-parser/chrono-parser.type";
import { chronoParseDate } from "../../utils/chrono-parser/chrono-parser";

export interface InclusiveDatesLabels {
  selected?: string;
  openCalendar?: string;
  calendar?: string;
  errorMessage?: string;
  invalidDateError?: string;
  maxDateError?: string;
  minDateError?: string;
}

const defaultLabels: InclusiveDatesLabels = {
  selected: "selected",
  openCalendar: "Open calendar",
  calendar: "calendar",
  invalidDateError: "We could not find a matching date",
  minDateError: `Please fill in a date after `,
  maxDateError: `Please fill in a date before `
};

@Component({
  scoped: true,
  shadow: false,
  styleUrl: "inclusive-dates.css",
  tag: "inclusive-dates"
})
export class InclusiveDates {
  @Element() el: HTMLElement;

  @Prop() locale?: string = navigator?.language || "en-US";
  @Prop() disableDate?: HTMLInclusiveDatesCalendarElement["disableDate"];
  @Prop() elementClassName?: string = "inclusive-dates";
  @Prop() disabled?: boolean = false;
  @Prop() minDate?: string;
  @Prop() maxDate?: string;
  @Prop() nextMonthButtonContent?: string;
  @Prop() nextYearButtonContent?: string;
  @Prop() showYearStepper?: boolean = false;
  @Prop() showMonthStepper?: boolean = true;
  @Prop() showClearButton?: boolean = true;
  @Prop() showTodayButton?: boolean = true;
  @Prop({ attribute: "input-should-format" }) formatInputOnAccept?: boolean =
    true;
  @Prop() showKeyboardHint?: boolean = true;
  @Prop() useStrictDateParsing?: boolean = false;
  @Prop() labels?: InclusiveDatesLabels = defaultLabels;
  @Prop() startDate?: string = getISODateString(
    removeTimezoneOffset(new Date())
  );
  // A unique ID for the datepicker. Mandatory for accessibility
  @Prop({ reflect: true }) id: string;
  @Prop() firstDayOfWeek?: number = 1; // Monday
  @Prop() label?: string = "Choose a date";
  @Prop() placeholder?: string = `Try "tomorrrow" or "in ten days"`;
  @Prop() quickButtons?: string[] = [
    "Yesterday",
    "Today",
    "Tomorrow",
    "In 10 days"
  ];
  @Prop() todayButtonContent?: string;
  @Prop({ mutable: true }) value?: string;
  @Prop({ mutable: true }) hasError?: boolean = false;

  @State() internalValue: string;
  @State() errorState: boolean = this.hasError;
  @State() disabledState: boolean = this.disabled;

  @Event() selectDate: EventEmitter<string | string[] | undefined>;

  private modalRef?: HTMLInclusiveDatesModalElement;
  private inputRef?: HTMLInputElement;
  private calendarButtonRef?: HTMLButtonElement;
  private pickerRef?: HTMLInclusiveDatesCalendarElement;
  private chronoSupportedLocale = ["en", "ja", "fr", "nl", "ru", "pt"].includes(
    this.locale.slice(0, 2)
  );
  private errorMessage = "Default error message";

  componentDidLoad() {
    if (!this.id) {
      console.error(
        'inclusive-dates: The "id" prop is required for accessibility'
      );
    }
    if (!this.chronoSupportedLocale)
      console.warn(
        `inclusive-dates: The chosen locale "${this.locale}" is not supported by Chrono.js. Date parsing has been disabled`
      );
  }

  // External method to parse text string using Chrono.js and (optionally) set as value.
  @Method()
  async parseDate(
    text: string,
    shouldSetValue = true,
    chronoOptions: ChronoOptions = undefined
  ): Promise<ChronoParsedDateString> {
    const parsedDate = await chronoParseDate(
      text,
      this.locale,
      this.chronoSupportedLocale,
      this.minDate,
      this.maxDate,
      chronoOptions
    );
    if (shouldSetValue) {
      if (parsedDate && parsedDate.value instanceof Date) {
        this.updateValue(parsedDate.value);
      } else this.errorState = true;
    }
    return {
      value:
        parsedDate && parsedDate.value instanceof Date
          ? getISODateString(parsedDate.value)
          : undefined,
      reason: parsedDate && parsedDate.reason ? parsedDate.reason : undefined
    };
  }

  private updateValue(newValue: Date) {
    this.pickerRef.value = newValue;
    this.internalValue = getISODateString(newValue);
    this.errorState = false;
    this.selectDate.emit(this.internalValue);
    announce(
      `${Intl.DateTimeFormat(this.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(newValue)} ${this.labels.selected}`,
      "polite"
    );
  }

  private handleCalendarButtonClick = async () => {
    await this.modalRef.setTriggerElement(this.calendarButtonRef);
    if ((await this.modalRef.getState()) === false) await this.modalRef?.open();
    else if ((await this.modalRef.getState()) === true)
      await this.modalRef?.close();
  };

  private handleQuickButtonClick = async (event: MouseEvent) => {
    const parsedDate = await chronoParseDate(
      (event.target as HTMLButtonElement).innerText,
      this.locale,
      this.chronoSupportedLocale,
      this.minDate,
      this.maxDate
    );
    if (parsedDate instanceof Date) {
      this.updateValue(parsedDate);
      if (document.activeElement !== this.inputRef) {
        this.formatInput(true, false);
      }
    }
  };

  private handleChangedMonths = (newMonth: MonthChangedEventDetails) => {
    announce(
      `${Intl.DateTimeFormat(this.locale, {
        month: "long",
        year: "numeric"
      }).format(
        removeTimezoneOffset(new Date(`${newMonth.year}-${newMonth.month}`))
      )}`,
      "assertive"
    );
  };
  private handleChange = async (event) => {
    this.errorState = false;
    if (event.target.value.length === 0) {
      this.internalValue = "";
      this.pickerRef.value = null;
      return this.selectDate.emit(this.internalValue);
    }
    const parsedDate = await chronoParseDate(
      event.target.value,
      this.locale,
      this.chronoSupportedLocale,
      this.minDate,
      this.maxDate
    );
    if (parsedDate.value instanceof Date) {
      this.updateValue(parsedDate.value);
      this.formatInput(true, false);
    } else {
      this.errorState = true;
      this.internalValue = null;
      let maxDate = undefined;
      let minDate = undefined;
      if (this.maxDate) {
        maxDate = this.maxDate
          ? removeTimezoneOffset(new Date(this.maxDate))
          : undefined;
        maxDate.setDate(maxDate.getDate() + 1);
      }
      if (this.minDate) {
        minDate = this.minDate
          ? removeTimezoneOffset(new Date(this.minDate))
          : undefined;
        minDate.setDate(minDate.getDate() - 1);
      }
      this.errorMessage = parsedDate.reason;
      this.errorMessage = {
        // TODO: Add locale date formatting to these messages
        minDate: minDate
          ? `${this.labels.minDateError} ${getISODateString(minDate)}`
          : "",
        maxDate: maxDate
          ? `${this.labels.maxDateError} ${getISODateString(maxDate)}`
          : "",
        invalid: this.labels.invalidDateError
      }[parsedDate.reason];
    }
  };

  private formatInput(enabled: boolean, useInputValue = true) {
    if (this.formatInputOnAccept === false || enabled === false) {
      if (this.internalValue) this.inputRef.value = this.internalValue;
      return;
    }
    if (
      this.internalValue &&
      this.formatInputOnAccept === true &&
      this.errorState === false
    ) {
      this.inputRef.value = Intl.DateTimeFormat(this.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(
        removeTimezoneOffset(
          new Date(useInputValue ? this.inputRef.value : this.internalValue)
        )
      );
    } else if (
      this.internalValue &&
      this.internalValue.length > 0 &&
      this.errorState === false
    )
      this.inputRef.value = this.internalValue;
  }

  private handlePickerSelection(newValue: string) {
    this.modalRef.close();
    this.inputRef.value = newValue;
    this.internalValue = newValue;
    this.errorState = false;
    if (document.activeElement !== this.inputRef) {
      this.formatInput(true, false);
    }
    announce(
      `${Intl.DateTimeFormat(this.locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(removeTimezoneOffset(new Date(newValue)))} ${
        this.labels.selected
      }!`,
      "polite"
    );
  }

  @Watch("hasError")
  watchHasError(newValue) {
    this.hasError = newValue;
  }

  @Watch("locale")
  watchLocale(newValue) {
    this.locale = newValue;
  }

  @Watch("label")
  watchLabel(newValue) {
    this.label = newValue;
  }

  @Watch("disabled")
  watchDisabled(newValue) {
    this.disabledState = newValue;
    this.disabled = newValue;
  }

  @Watch("minDate")
  watchMinDate(newValue) {
    this.minDate = newValue;
  }

  @Watch("maxDate")
  watchMaxDate(newValue) {
    this.maxDate = newValue;
  }

  @Watch("formatInputOnAccept")
  watchFormatInput(newValue) {
    this.formatInputOnAccept = newValue;
  }

  @Watch("value")
  watchValue() {
    if (Boolean(this.value)) {
      this.internalValue = this.value;
    }
  }

  private getClassName(element?: string) {
    return Boolean(element)
      ? `${this.elementClassName}__${element}`
      : this.elementClassName;
  }

  render() {
    return (
      <Host>
        <label
          htmlFor={this.id ? `${this.id}-input` : undefined}
          class={this.getClassName("label")}
        >
          {this.label}
        </label>
        <br />
        <div class={this.getClassName("input-container")}>
          <input
            disabled={this.disabledState}
            id={this.id ? `${this.id}-input` : undefined}
            type="text"
            placeholder={this.placeholder}
            class={this.getClassName("input")}
            ref={(r) => (this.inputRef = r)}
            onChange={this.handleChange}
            onFocus={() => this.formatInput(false)}
            onBlur={() => this.formatInput(true, false)}
            aria-describedby={this.errorState ? `${this.id}-error` : undefined}
            aria-invalid={this.errorState}
          />
          <button
            ref={(r) => (this.calendarButtonRef = r)}
            onClick={this.handleCalendarButtonClick}
            class={this.getClassName("calendar-button")}
            disabled={this.disabledState}
          >
            {this.labels.openCalendar}
          </button>
        </div>
        <inclusive-dates-modal
          label={this.labels.calendar}
          ref={(el) => (this.modalRef = el)}
          onOpened={() => {
            this.pickerRef.modalIsOpen = true;
          }}
          onClosed={() => {
            this.pickerRef.modalIsOpen = false;
          }}
        >
          <inclusive-dates-calendar
            locale={this.locale}
            onSelectDate={(event) =>
              this.handlePickerSelection(event.detail as string)
            }
            onChangeMonth={(event) =>
              this.handleChangedMonths(event.detail as MonthChangedEventDetails)
            }
            ref={(el) => (this.pickerRef = el)}
            startDate={this.startDate}
            firstDayOfWeek={this.firstDayOfWeek}
            showHiddenTitle={true}
            disabled={this.disabledState}
            showMonthStepper={this.showMonthStepper}
            showYearStepper={this.showYearStepper}
            showClearButton={this.showClearButton}
            showKeyboardHint={this.showKeyboardHint}
            minDate={this.minDate}
            maxDate={this.maxDate}
          />
        </inclusive-dates-modal>
        {this.quickButtons?.length > 0 && this.chronoSupportedLocale && (
          <div
            class={this.getClassName("quick-group")}
            role="group"
            aria-label="Quick selection"
          >
            {this.quickButtons.map((buttonText) => {
              return (
                <button
                  class={this.getClassName("quick-button")}
                  onClick={this.handleQuickButtonClick}
                  disabled={this.disabledState}
                >
                  {buttonText}
                </button>
              );
            })}
          </div>
        )}

        {this.errorState && (
          <div
            class={this.getClassName("input-error")}
            id={this.id ? `${this.id}-error` : undefined}
            role="status"
          >
            {this.errorMessage}
          </div>
        )}
      </Host>
    );
  }
}
