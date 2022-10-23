import {
  Component,
  Input,
  Output,
  HostBinding,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  ViewChild,
  SimpleChanges,
  NgZone,
  ElementRef,
  EventEmitter,
  ChangeDetectionStrategy
} from '@angular/core';
import { GalleryConfig } from '../models/config.model';
import { GalleryState, GalleryError } from '../models/gallery.model';
import { ThumbnailsPosition, ThumbnailsView } from '../models/constants';
import { ThumbSliderAdapter, HorizontalThumbAdapter, VerticalThumbAdapter } from './adapters';
import { SmoothScrollManager } from '../smooth-scroll';

declare const Hammer: any;

@Component({
  selector: 'gallery-thumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="g-thumbs-container">
      <div #slider
           class="g-slider"
           [attr.centralised]="config.thumbView === thumbnailsView.Contain || adapter.isContentLessThanContainer">
        <gallery-thumb *ngFor="let item of state.items; trackBy: trackByFn; index as i"
                       [style.flex]="'0 0 ' + adapter.thumbSize + 'px'"
                       [type]="item.type"
                       [config]="config"
                       [data]="item.data"
                       [currIndex]="state.currIndex"
                       [index]="i"
                       (click)="config.disableThumb ? null : thumbClick.emit(i)"
                       (error)="error.emit({itemIndex: i, error: $event})">
        </gallery-thumb>
      </div>
    </div>
  `
})
export class GalleryThumbsComponent implements AfterViewInit, OnChanges, OnDestroy {

  /** HammerJS instance */
  private _hammer: any;

  /** Thumbnails view enum */
  readonly thumbnailsView = ThumbnailsView;

  /** Slider adapter */
  adapter: ThumbSliderAdapter;

  /** Gallery state */
  @Input() state: GalleryState;

  /** Gallery config */
  @Input() config: GalleryConfig;

  /** Stream that emits when the active item should change */
  @Output() action = new EventEmitter<string | number>();

  /** Stream that emits when thumb is clicked */
  @Output() thumbClick = new EventEmitter<number>();

  /** Stream that emits when an error occurs */
  @Output() error = new EventEmitter<GalleryError>();

  /** Host height */
  @HostBinding('style.height') height: string;

  /** Host width */
  @HostBinding('style.width') width: string;

  /** Slider ElementRef */
  @ViewChild('slider', { static: true }) sliderEl: ElementRef;

  get slider(): HTMLElement {
    return this.sliderEl.nativeElement;
  }

  get centralizerSize(): number {
    if (this.adapter.isContentLessThanContainer) {
      const size = this.adapter.clientSize - (this.adapter.thumbSize * this.state.items.length);
      return size / 2;
    }
    return (this.adapter.clientSize / 2) - (this.adapter.thumbSize / 2);
  }

  constructor(private _el: ElementRef, private _zone: NgZone, private _smoothScroll: SmoothScrollManager) {
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.state.firstChange || !this.config.thumbDetached) {
      // Scroll slide to item when current index changes.
      requestAnimationFrame(() => {
        this.scrollToIndex(this.state.currIndex, changes.state.firstChange ? 'auto' : 'smooth');
      });
    }

    if (changes.config) {
      // Sets sliding direction
      if (changes.config.currentValue?.thumbPosition !== changes.config.previousValue?.thumbPosition) {
        switch (this.config.thumbPosition) {
          case ThumbnailsPosition.Right:
          case ThumbnailsPosition.Left:
            this.adapter = new VerticalThumbAdapter(this.slider, this.config);
            break;
          case ThumbnailsPosition.Top:
          case ThumbnailsPosition.Bottom:
            this.adapter = new HorizontalThumbAdapter(this.slider, this.config);
            break;
        }
        // Set host height and width according to thumb position
        this.width = this.adapter.containerWidth;
        this.height = this.adapter.containerHeight;
      }

      // Enable/Disable gestures
      if (changes.config.currentValue?.gestures !== changes.config.previousValue?.gestures) {
        if (this.config.gestures) {
          this.activateGestures();
        } else {
          this.deactivateGestures();
        }
      }
    }
  }

  ngAfterViewInit(): void {
    // Workaround: opening a lightbox (centralised) with last index active, show in wrong position
    setTimeout(() => this.scrollToIndex(this.state.currIndex, 'auto'), 200);
  }

  ngAfterViewChecked(): void {
    this.slider.style.setProperty('--thumb-centralize-size', this.centralizerSize + 'px');
  }

  ngOnDestroy(): void {
    this.deactivateGestures();
  }

  trackByFn(index: number, item: any) {
    return item.type;
  }

  private scrollToIndex(value: number, behavior): void {
    this._zone.runOutsideAngular(() => {
      this.slider.style.scrollSnapType = 'unset';
      this._smoothScroll.scrollTo(this.slider, this.adapter.getCentralisedScrollToValue(value, behavior)).then(() => {
        this.slider.style.scrollSnapType = this.adapter.scrollSnapType;
      });
    });
  }

  private activateGestures(): void {
    if (typeof Hammer !== 'undefined' && !this.config.disableThumb) {

      const direction: number = this.adapter.panDirection;

      // Activate gestures
      this._zone.runOutsideAngular(() => {
        this._hammer = new Hammer(this._el.nativeElement, { inputClass: Hammer.MouseInput });
        this._hammer.get('pan').set({ direction });

        let panOffset: number = 0;

        this._hammer.on('panstart', () => {
          panOffset = this.adapter.scrollValue;
          // Disable scroll-snap-type functionality
          this.slider.style.scrollSnapType = 'unset';
          this.slider.classList.add('g-sliding');
        });
        this._hammer.on('panmove', (e) => this.slider.scrollTo(this.adapter.getPanValue(panOffset, e, 'auto')));
        this._hammer.on('panend', () => {
          // Enable scroll-snap-type functionality
          this.slider.style.scrollSnapType = this.adapter.scrollSnapType;
          this.slider.classList.remove('g-sliding');
        });
      });
    }
  }

  private deactivateGestures(): void {
    this._hammer?.destroy();
  }
}
